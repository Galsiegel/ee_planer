import type {
  SpecializationCatalogSelectionState,
  SpecializationChoiceRule,
  SpecializationCourseOption,
  SpecializationCourseReference,
  SpecializationDiagnostic,
  SpecializationGroup,
  SpecializationGroupEvaluation,
  SpecializationGroupYearVariant,
  SpecializationMode,
  SpecializationMutualExclusionRule,
  SpecializationReplacementRule,
  SpecializationRequirementSet,
  SpecializationRuleBlock,
  SpecializationRuleEvaluation,
  TrackId,
  TrackSpecializationCatalog,
  TrackSpecializationSelectionSanitization,
} from '../../types';

export const TRACK_SPECIALIZATION_FOLDERS: Record<TrackId, string> = {
  ee: 'מסלול הנדסת חשמל',
  cs: 'מסלול הנדסת מחשבים ותוכנה',
  ee_math: 'מסלול הנדסת חשמל ומתמטיקה',
  ee_physics: 'מסלול הנדסת חשמל ופיזיקה',
  ee_combined: 'מסלול משולב-חשמל-פיסיקה(178 נקז)',
  ce: 'מסלול הנדסת מחשבים',
};

const FORCED_SINGLE_ONLY_TRACKS = new Set<TrackId>(['ee_math', 'cs', 'ce']);
const MODES: SpecializationMode[] = ['single', 'double'];

type RawTrackSpecializationFile = {
  path: string;
  content: string;
};

type RawTrackSpecializationSource = Partial<Record<TrackId, RawTrackSpecializationFile[]>>;

type ParsedCourseReference = SpecializationCourseReference;

function makeDiagnostic(
  severity: 'warning' | 'error',
  code: string,
  message: string,
  extras: Partial<SpecializationDiagnostic> = {},
): SpecializationDiagnostic {
  return {
    severity,
    code,
    message,
    ...extras,
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseChoiceCount(type: string): number | null {
  const match = /^choose_(\d+)_from$/u.exec(type);
  if (match) return Number(match[1]);
  return null;
}

function parseAtMostCount(type: string): number | null {
  const match = /^choose_at_most_(\d+)_from$/u.exec(type);
  if (match) return Number(match[1]);
  return null;
}

function dedupeCourseNumbers(courseNumbers: string[]): string[] {
  return [...new Set(courseNumbers)];
}

function collectRuleCourseNumbers(
  rule: SpecializationChoiceRule | null,
): string[] {
  if (!rule) return [];
  const courseNumbers: string[] = [];
  for (const option of rule.options) {
    if (option.kind === 'course') {
      courseNumbers.push(option.courseNumber);
      continue;
    }
    courseNumbers.push(...collectRuleCourseNumbers(option));
  }
  return dedupeCourseNumbers(courseNumbers);
}

function parseCourseReference(
  value: unknown,
  diagnostics: SpecializationDiagnostic[],
  context: { trackId: TrackId; filePath: string; specializationName: string; field: string },
): ParsedCourseReference | null {
  if (!isPlainObject(value)) {
    diagnostics.push(makeDiagnostic(
      'error',
      'invalid-course-ref',
      `השדה ${context.field} חייב להיות אובייקט קורס תקין.`,
      context,
    ));
    return null;
  }

  const courseNumber = typeof value.course_number === 'string' ? value.course_number.trim() : '';
  const courseName = typeof value.course_name === 'string' ? value.course_name.trim() : '';
  const category = typeof value.category === 'string' ? value.category.trim() : undefined;

  if (!courseNumber || !courseName) {
    diagnostics.push(makeDiagnostic(
      'error',
      'missing-course-fields',
      `השדה ${context.field} חסר course_number או course_name.`,
      context,
    ));
    return null;
  }

  return { courseNumber, courseName, category };
}

function parseChoiceRule(
  value: unknown,
  diagnostics: SpecializationDiagnostic[],
  context: { trackId: TrackId; filePath: string; specializationName: string; field: string },
): SpecializationChoiceRule | null {
  if (!isPlainObject(value)) {
    diagnostics.push(makeDiagnostic(
      'error',
      'invalid-choice-rule',
      `השדה ${context.field} חייב להיות חוק בחירה תקין.`,
      context,
    ));
    return null;
  }

  const type = typeof value.type === 'string' ? value.type.trim() : '';
  const count = parseChoiceCount(type) ?? parseAtMostCount(type);
  const options = Array.isArray(value.options) ? value.options : null;

  if (!type || count === null || !options) {
    diagnostics.push(makeDiagnostic(
      'error',
      'invalid-choice-shape',
      `השדה ${context.field} כולל חוק בחירה לא נתמך (${type || 'missing type'}).`,
      context,
    ));
    return null;
  }

  const parsedOptions: Array<SpecializationChoiceRule | SpecializationCourseOption> = [];
  for (const [index, option] of options.entries()) {
    if (isPlainObject(option) && typeof option.course_number === 'string') {
      const parsedCourse = parseCourseReference(option, diagnostics, {
        ...context,
        field: `${context.field}.options[${index}]`,
      });
      if (parsedCourse) {
        parsedOptions.push({
          kind: 'course',
          ...parsedCourse,
        });
      }
      continue;
    }

    const nestedRule = parseChoiceRule(option, diagnostics, {
      ...context,
      field: `${context.field}.options[${index}]`,
    });
    if (nestedRule) parsedOptions.push(nestedRule);
  }

  if (parsedOptions.length === 0) {
    diagnostics.push(makeDiagnostic(
      'error',
      'empty-choice-rule',
      `השדה ${context.field} אינו כולל אפשרויות תקינות.`,
      context,
    ));
    return null;
  }

  return {
    kind: 'choice_rule',
    type,
    count,
    options: parsedOptions,
    note: typeof value.note === 'string' ? value.note.trim() : undefined,
    groupName: typeof value.group_name === 'string' ? value.group_name.trim() : undefined,
  };
}

function parseMandatoryCourses(
  value: unknown,
  diagnostics: SpecializationDiagnostic[],
  context: { trackId: TrackId; filePath: string; specializationName: string; field: string },
): ParsedCourseReference[] {
  if (!Array.isArray(value)) {
    diagnostics.push(makeDiagnostic(
      'error',
      'invalid-mandatory-courses',
      `השדה ${context.field} חייב להיות מערך.`,
      context,
    ));
    return [];
  }

  return value
    .map((item, index) => parseCourseReference(item, diagnostics, {
      ...context,
      field: `${context.field}[${index}]`,
    }))
    .filter((item): item is ParsedCourseReference => item !== null);
}

function parseMandatoryChoiceRules(
  requirements: Record<string, unknown>,
  diagnostics: SpecializationDiagnostic[],
  context: { trackId: TrackId; filePath: string; specializationName: string },
): SpecializationChoiceRule[] {
  const singleRule = requirements.mandatory_choice_rule;
  const multipleRules = requirements.mandatory_choice_rules;
  const groupedRules = requirements.mandatory_choice_groups;

  const definedRuleFormats = [singleRule, multipleRules, groupedRules]
    .filter((value) => value !== undefined).length;

  if (definedRuleFormats > 1) {
    diagnostics.push(makeDiagnostic(
      'error',
      'conflicting-mandatory-choice-rules',
      'הוגדרו גם mandatory_choice_rule וגם mandatory_choice_rules.',
      context,
    ));
    return [];
  }

  if (singleRule !== undefined) {
    const parsed = parseChoiceRule(singleRule, diagnostics, {
      ...context,
      field: 'mandatory_choice_rule',
    });
    return parsed ? [parsed] : [];
  }

  const ruleList = multipleRules ?? groupedRules;
  const fieldName = multipleRules !== undefined ? 'mandatory_choice_rules' : 'mandatory_choice_groups';

  if (ruleList === undefined) return [];
  if (!Array.isArray(ruleList)) {
    diagnostics.push(makeDiagnostic(
      'error',
      'invalid-mandatory-choice-rules-array',
      'השדה mandatory_choice_rules חייב להיות מערך.',
      context,
    ));
    return [];
  }

  return ruleList
    .map((rule, index) => parseChoiceRule(rule, diagnostics, {
      ...context,
      field: `${fieldName}[${index}]`,
    }))
    .filter((rule): rule is SpecializationChoiceRule => rule !== null);
}

function parseReplacementRules(
  value: unknown,
  diagnostics: SpecializationDiagnostic[],
  context: { trackId: TrackId; filePath: string; specializationName: string },
): SpecializationReplacementRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push(makeDiagnostic(
      'error',
      'invalid-replacement-rules',
      'השדה replacement_rules חייב להיות מערך.',
      context,
    ));
    return [];
  }

  return value.flatMap((rule, index) => {
    if (!isPlainObject(rule)) {
      diagnostics.push(makeDiagnostic(
        'error',
        'invalid-replacement-rule',
        `replacement_rules[${index}] אינו חוק החלפה תקין.`,
        context,
      ));
      return [];
    }

    const replaceableCourse = parseCourseReference(rule.replaceable_course, diagnostics, {
      ...context,
      field: `replacement_rules[${index}].replaceable_course`,
    });
    const rawReplacements = Array.isArray(rule.allowed_replacements) ? rule.allowed_replacements : [];
    const allowedReplacements = rawReplacements
      .map((replacement, replacementIndex) => parseCourseReference(replacement, diagnostics, {
        ...context,
        field: `replacement_rules[${index}].allowed_replacements[${replacementIndex}]`,
      }))
      .filter((replacement): replacement is ParsedCourseReference => replacement !== null);

    if (!replaceableCourse || allowedReplacements.length === 0) return [];

    return [{
      replaceableCourse,
      allowedReplacements,
      note: typeof rule.note === 'string' ? rule.note.trim() : undefined,
    }];
  });
}

function parseMutualExclusionRules(
  value: unknown,
  diagnostics: SpecializationDiagnostic[],
  context: { trackId: TrackId; filePath: string; specializationName: string },
): SpecializationMutualExclusionRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push(makeDiagnostic(
      'error',
      'invalid-mutual-exclusion-rules',
      'השדה mutual_exclusion_rules חייב להיות מערך.',
      context,
    ));
    return [];
  }

  return value.flatMap((rule, index) => {
    if (!isPlainObject(rule)) {
      diagnostics.push(makeDiagnostic(
        'error',
        'invalid-mutual-exclusion-rule',
        `mutual_exclusion_rules[${index}] אינו חוק תקין.`,
        context,
      ));
      return [];
    }

    const type = typeof rule.type === 'string' ? rule.type.trim() : '';
    const count = parseAtMostCount(type);
    const rawOptions = Array.isArray(rule.options) ? rule.options : [];
    if (!type || count === null) {
      diagnostics.push(makeDiagnostic(
        'error',
        'unsupported-mutual-exclusion-rule',
        `חוק mutual_exclusion_rules[${index}] משתמש בסוג לא נתמך (${type || 'missing type'}).`,
        context,
      ));
      return [];
    }

    const options = rawOptions
      .map((option, optionIndex) => parseCourseReference(option, diagnostics, {
        ...context,
        field: `mutual_exclusion_rules[${index}].options[${optionIndex}]`,
      }))
      .filter((option): option is ParsedCourseReference => option !== null);

    if (options.length === 0) return [];

    return [{
      type,
      count,
      options,
      note: typeof rule.note === 'string' ? rule.note.trim() : undefined,
    }];
  });
}

function parseRequirementSet(
  value: unknown,
  diagnostics: SpecializationDiagnostic[],
  context: { trackId: TrackId; filePath: string; specializationName: string; mode: SpecializationMode },
): SpecializationRequirementSet | null {
  if (!isPlainObject(value)) {
    diagnostics.push(makeDiagnostic(
      'error',
      'invalid-requirements',
      `חוקי ההתמחות עבור מצב ${context.mode} חייבים להיות אובייקט.`,
      context,
    ));
    return null;
  }

  const totalCoursesRequiredForGroup = typeof value.total_courses_required_for_group === 'number'
    ? value.total_courses_required_for_group
    : null;

  if (totalCoursesRequiredForGroup === null) {
    diagnostics.push(makeDiagnostic(
      'error',
      'missing-total-courses-required',
      `חסר total_courses_required_for_group עבור מצב ${context.mode}.`,
      context,
    ));
    return null;
  }

  const mandatoryCourses = parseMandatoryCourses(
    value.mandatory_courses ?? [],
    diagnostics,
    { ...context, field: `${context.mode}.mandatory_courses` },
  );
  const mandatoryChoiceRules = parseMandatoryChoiceRules(
    value,
    diagnostics,
    context,
  );
  const selectionRule = value.selection_rule === undefined
    ? null
    : parseChoiceRule(value.selection_rule, diagnostics, {
      ...context,
      field: `${context.mode}.selection_rule`,
    });
  const additionalCoursesRequired = typeof value.additional_courses_required === 'number'
    ? value.additional_courses_required
    : 0;
  const additionalCourseSelectionRule = value.additional_course_selection_rule === undefined
    ? null
    : parseChoiceRule(value.additional_course_selection_rule, diagnostics, {
      ...context,
      field: `${context.mode}.additional_course_selection_rule`,
    });
  const logicalExpression = typeof value.logical_expression === 'string'
    ? value.logical_expression.trim()
    : null;

  const minimumRequired =
    mandatoryCourses.length +
    mandatoryChoiceRules.reduce((sum, rule) => sum + rule.count, 0) +
    (selectionRule ? selectionRule.count : 0) +
    additionalCoursesRequired;

  if (minimumRequired > totalCoursesRequiredForGroup) {
    diagnostics.push(makeDiagnostic(
      'error',
      'contradictory-total-course-count',
      `סך הדרישות המינימלי (${minimumRequired}) גדול מ-total_courses_required_for_group (${totalCoursesRequiredForGroup}) במצב ${context.mode}.`,
      context,
    ));
  }

  if (additionalCoursesRequired > 0 && !additionalCourseSelectionRule) {
    diagnostics.push(makeDiagnostic(
      'error',
      'missing-additional-course-selection-rule',
      `נדרש additional_course_selection_rule עבור מצב ${context.mode} כאשר additional_courses_required גדול מ-0.`,
      context,
    ));
  }

  if (logicalExpression) {
    const mandatoryTokens = mandatoryCourses.every((course) => logicalExpression.includes(course.courseNumber));
    if (!mandatoryTokens) {
      diagnostics.push(makeDiagnostic(
        'warning',
        'logical-expression-mismatch',
        `logical_expression במצב ${context.mode} אינו תואם לכל קורסי החובה המובנים.`,
        context,
      ));
    }
    if (!logicalExpression.includes(String(totalCoursesRequiredForGroup)) && !logicalExpression.includes('ADDITIONAL')) {
      diagnostics.push(makeDiagnostic(
        'warning',
        'logical-expression-count-mismatch',
        `logical_expression במצב ${context.mode} אינו משקף במפורש את ספירת הקורסים הכוללת.`,
        context,
      ));
    }
  }

  return {
    totalCoursesRequiredForGroup,
    mandatoryCourses,
    mandatoryChoiceRules,
    selectionRule,
    additionalCoursesRequired,
    additionalCourseSelectionRule,
    logicalExpression,
  };
}

function buildGroupCourseList(
  rawCourses: unknown,
  replacementRules: SpecializationReplacementRule[],
  diagnostics: SpecializationDiagnostic[],
  context: { trackId: TrackId; filePath: string; specializationName: string },
): SpecializationCourseReference[] {
  const courses = Array.isArray(rawCourses)
    ? rawCourses
      .map((course, index) => parseCourseReference(course, diagnostics, {
        ...context,
        field: `courses[${index}]`,
      }))
      .filter((course): course is ParsedCourseReference => course !== null)
    : [];

  const byNumber = new Map(courses.map((course) => [course.courseNumber, course]));
  for (const replacementRule of replacementRules) {
    if (!byNumber.has(replacementRule.replaceableCourse.courseNumber)) {
      byNumber.set(replacementRule.replaceableCourse.courseNumber, replacementRule.replaceableCourse);
    }
    for (const replacement of replacementRule.allowedReplacements) {
      if (!byNumber.has(replacement.courseNumber)) {
        byNumber.set(replacement.courseNumber, replacement);
      }
    }
  }

  return [...byNumber.values()];
}

function buildGroupLegacyLists(
  courses: SpecializationCourseReference[],
  requirementsByMode: Record<SpecializationMode, SpecializationRequirementSet | null>,
): Pick<SpecializationGroup, 'mandatoryCourses' | 'electiveCourses'> {
  const singleRequirements = requirementsByMode.single;
  const mandatoryCourseNumbers = dedupeCourseNumbers(
    singleRequirements?.mandatoryCourses.map((course) => course.courseNumber) ?? [],
  );
  const electiveCourses = courses
    .map((course) => course.courseNumber)
    .filter((courseNumber) => !mandatoryCourseNumbers.includes(courseNumber));

  return {
    mandatoryCourses: mandatoryCourseNumbers,
    electiveCourses,
  };
}

function normalizeSupportedModes(
  trackId: TrackId,
  groupModes: SpecializationMode[],
  diagnostics: SpecializationDiagnostic[],
  context: { filePath: string; specializationName: string },
): SpecializationMode[] {
  const normalizedModes: SpecializationMode[] = groupModes.length > 0 ? groupModes : ['single'];
  if (FORCED_SINGLE_ONLY_TRACKS.has(trackId) && normalizedModes.includes('double')) {
    diagnostics.push(makeDiagnostic(
      'warning',
      'double-mode-disabled-for-track',
      'המסלול הנוכחי מוגדר כחד-התמחות בלבד ולכן מצב double ינוטרל.',
      {
        trackId,
        filePath: context.filePath,
        specializationName: context.specializationName,
      },
    ));
    return ['single'];
  }
  return normalizedModes;
}

function buildTrackCatalog(
  trackId: TrackId,
  files: RawTrackSpecializationFile[],
): TrackSpecializationCatalog {
  const trackFolder = TRACK_SPECIALIZATION_FOLDERS[trackId];
  const diagnostics: SpecializationDiagnostic[] = [];

  if (files.length === 0) {
    diagnostics.push(makeDiagnostic(
      'error',
      'missing-track-specialization-files',
      `לא נמצאו קבצי התמחות עבור המסלול ${trackFolder}.`,
      { trackId },
    ));
    return {
      trackId,
      trackFolder,
      groups: [],
      diagnostics,
      hasErrors: true,
      interactionDisabled: true,
    };
  }

  const groups: SpecializationGroup[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.content) as unknown;
    } catch (error) {
      diagnostics.push(makeDiagnostic(
        'error',
        'malformed-specialization-json',
        `נכשל פענוח JSON עבור ${file.path}: ${error instanceof Error ? error.message : 'unknown error'}.`,
        { trackId, filePath: file.path },
      ));
      continue;
    }

    if (!isPlainObject(parsed)) {
      diagnostics.push(makeDiagnostic(
        'error',
        'invalid-specialization-file',
        `הקובץ ${file.path} אינו אובייקט JSON תקין.`,
        { trackId, filePath: file.path },
      ));
      continue;
    }

    const specializationName = typeof parsed.specialization_group_name === 'string'
      ? parsed.specialization_group_name.trim()
      : '';
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : specializationName;

    if (!specializationName) {
      diagnostics.push(makeDiagnostic(
        'error',
        'missing-specialization-name',
        `הקובץ ${file.path} חסר specialization_group_name.`,
        { trackId, filePath: file.path },
      ));
      continue;
    }

    const groupDiagnostics: SpecializationDiagnostic[] = [];
    const context = {
      trackId,
      filePath: file.path,
      specializationName,
    };

    const replacementRules = parseReplacementRules(parsed.replacement_rules, groupDiagnostics, context);
    const mutualExclusionRules = parseMutualExclusionRules(parsed.mutual_exclusion_rules, groupDiagnostics, context);
    const courses = buildGroupCourseList(parsed.courses, replacementRules, groupDiagnostics, context);
    const rawRequirements = isPlainObject(parsed.requirements) ? parsed.requirements : null;

    if (!rawRequirements) {
      groupDiagnostics.push(makeDiagnostic(
        'error',
        'missing-requirements',
        'חסר אובייקט requirements תקין.',
        context,
      ));
      diagnostics.push(...groupDiagnostics);
      continue;
    }

    const rawGroupModes = Array.isArray(parsed.group_modes)
      ? parsed.group_modes.filter((mode): mode is SpecializationMode => mode === 'single' || mode === 'double')
      : [];
    const supportedModes = normalizeSupportedModes(trackId, rawGroupModes, groupDiagnostics, context);

    const requirementsByMode: Record<SpecializationMode, SpecializationRequirementSet | null> = {
      single: null,
      double: null,
    };

    const hasModeSplit = rawRequirements.single_group_rules !== undefined || rawRequirements.double_group_rules !== undefined;

    if (hasModeSplit) {
      for (const mode of MODES) {
        if (!supportedModes.includes(mode)) continue;
        const modeKey = mode === 'single' ? 'single_group_rules' : 'double_group_rules';
        if (!isPlainObject(rawRequirements[modeKey])) {
          groupDiagnostics.push(makeDiagnostic(
            'error',
            'missing-mode-requirements',
            `חסר ${modeKey} עבור מצב ${mode}.`,
            context,
          ));
          continue;
        }
        requirementsByMode[mode] = parseRequirementSet(rawRequirements[modeKey], groupDiagnostics, {
          ...context,
          mode,
        });
      }
    } else {
      requirementsByMode.single = parseRequirementSet(rawRequirements, groupDiagnostics, {
        ...context,
        mode: 'single',
      });
    }

    if (!requirementsByMode.single) {
      groupDiagnostics.push(makeDiagnostic(
        'error',
        'missing-single-mode',
        'לא ניתן לבנות חוקי single תקינים עבור קבוצת ההתמחות.',
        context,
      ));
    }

    const modeState = supportedModes.includes('double') && requirementsByMode.double
      ? 'single_and_double'
      : 'single_only';

    const legacyLists = buildGroupLegacyLists(courses, requirementsByMode);

    const group: SpecializationGroup = {
      id: slugify(`${trackId}-${specializationName}`),
      trackId,
      title,
      name: specializationName,
      sourceFile: file.path,
      courses,
      mandatoryCourses: legacyLists.mandatoryCourses,
      mandatoryOptions: requirementsByMode.single?.mandatoryChoiceRules.map((rule) =>
        collectRuleCourseNumbers(rule),
      ) ?? [],
      electiveCourses: legacyLists.electiveCourses,
      minCoursesToComplete: requirementsByMode.single?.totalCoursesRequiredForGroup ?? 0,
      doubleMinCoursesToComplete: requirementsByMode.double?.totalCoursesRequiredForGroup ?? undefined,
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((note): note is string => typeof note === 'string')
        : [],
      modeState,
      supportedModes: modeState === 'single_and_double' ? ['single', 'double'] : ['single'],
      canBeDouble: modeState === 'single_and_double',
      requirementsByMode,
      mutualExclusionRules,
      replacementRules,
      diagnostics: groupDiagnostics,
    };

    groups.push(group);
    diagnostics.push(...groupDiagnostics);
  }

  return {
    trackId,
    trackFolder,
    groups,
    diagnostics,
    hasErrors: diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    interactionDisabled: diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
  };
}

export function buildTrackSpecializationCatalogs(
  sources: RawTrackSpecializationSource,
): Record<TrackId, TrackSpecializationCatalog> {
  return {
    ee: buildTrackCatalog('ee', sources.ee ?? []),
    cs: buildTrackCatalog('cs', sources.cs ?? []),
    ee_math: buildTrackCatalog('ee_math', sources.ee_math ?? []),
    ee_physics: buildTrackCatalog('ee_physics', sources.ee_physics ?? []),
    ee_combined: buildTrackCatalog('ee_combined', sources.ee_combined ?? []),
    ce: buildTrackCatalog('ce', sources.ce ?? []),
  };
}

function buildReplacementAliasMap(group: SpecializationGroup): Map<string, string[]> {
  const replacementMap = new Map<string, string[]>();
  for (const rule of group.replacementRules) {
    replacementMap.set(rule.replaceableCourse.courseNumber, [
      rule.replaceableCourse.courseNumber,
      ...rule.allowedReplacements.map((replacement) => replacement.courseNumber),
    ]);
  }
  return replacementMap;
}

function courseIsSatisfied(
  courseNumber: string,
  takenCourses: Set<string>,
  replacementMap: Map<string, string[]>,
): { satisfied: boolean; matchedCourseNumbers: string[] } {
  const aliases = replacementMap.get(courseNumber) ?? [courseNumber];
  const matchedCourseNumbers = aliases.filter((candidate) => takenCourses.has(candidate));
  return {
    satisfied: matchedCourseNumbers.length > 0,
    matchedCourseNumbers,
  };
}

type ChoiceRuleEvaluation = SpecializationRuleEvaluation & { minConsumedCourseNumbers: string[] };

function evaluateChoiceRule(
  rule: SpecializationChoiceRule | null,
  takenCourses: Set<string>,
  replacementMap: Map<string, string[]>,
): ChoiceRuleEvaluation {
  if (!rule) {
    return {
      satisfied: true,
      satisfiedOptionCount: 0,
      requiredOptionCount: 0,
      matchedCourseNumbers: [],
      minConsumedCourseNumbers: [],
    };
  }

  const satisfiedOptions: string[][] = [];
  for (const option of rule.options) {
    if (option.kind === 'course') {
      const evaluation = courseIsSatisfied(option.courseNumber, takenCourses, replacementMap);
      if (evaluation.satisfied) satisfiedOptions.push(evaluation.matchedCourseNumbers);
      continue;
    }

    const nestedEvaluation = evaluateChoiceRule(option, takenCourses, replacementMap);
    if (nestedEvaluation.satisfied) satisfiedOptions.push(nestedEvaluation.matchedCourseNumbers);
  }

  const isAtMostRule = parseAtMostCount(rule.type) !== null;
  const satisfied = isAtMostRule
    ? satisfiedOptions.length <= rule.count
    : satisfiedOptions.length >= rule.count;

  // For consumption tracking: at-most rules consume all matched options; at-least rules
  // consume only the minimum required count so extras remain available for later slots.
  const consumedOptions = isAtMostRule ? satisfiedOptions : satisfiedOptions.slice(0, rule.count);

  return {
    satisfied,
    satisfiedOptionCount: satisfiedOptions.length,
    requiredOptionCount: rule.count,
    matchedCourseNumbers: dedupeCourseNumbers(satisfiedOptions.flat()),
    minConsumedCourseNumbers: dedupeCourseNumbers(consumedOptions.flat()),
  };
}

function evaluateMandatoryCourses(
  requirements: SpecializationRequirementSet,
  takenCourses: Set<string>,
  replacementMap: Map<string, string[]>,
): { satisfied: boolean; matchedCourseNumbers: string[] } {
  const matched: string[] = [];
  for (const course of requirements.mandatoryCourses) {
    const evaluation = courseIsSatisfied(course.courseNumber, takenCourses, replacementMap);
    if (!evaluation.satisfied) return { satisfied: false, matchedCourseNumbers: matched };
    matched.push(...evaluation.matchedCourseNumbers);
  }
  return {
    satisfied: true,
    matchedCourseNumbers: dedupeCourseNumbers(matched),
  };
}

function evaluateMutualExclusionRules(
  rules: SpecializationMutualExclusionRule[],
  takenCourses: Set<string>,
): { satisfied: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const rule of rules) {
    const matched = rule.options
      .map((option) => option.courseNumber)
      .filter((courseNumber) => takenCourses.has(courseNumber));
    if (matched.length > rule.count) {
      issues.push(rule.note ?? `נבחרו יותר מדי קורסים מקבוצת אי-הכללה (${matched.join(', ')})`);
    }
  }
  return { satisfied: issues.length === 0, issues };
}

function collectTrackGroupCourseNumbers(group: SpecializationGroup): string[] {
  const direct = group.courses.map((course) => course.courseNumber);
  const fromRequirements = MODES.flatMap((mode) => {
    const requirements = group.requirementsByMode[mode];
    if (!requirements) return [];
    return [
      ...requirements.mandatoryCourses.map((course) => course.courseNumber),
      ...requirements.mandatoryChoiceRules.flatMap((rule) => collectRuleCourseNumbers(rule)),
      ...collectRuleCourseNumbers(requirements.selectionRule),
      ...collectRuleCourseNumbers(requirements.additionalCourseSelectionRule),
    ];
  });
  return dedupeCourseNumbers([...direct, ...fromRequirements]);
}

function collectRuleOptions(rule: SpecializationChoiceRule | null): SpecializationCourseReference[] {
  if (!rule) return [];
  const result: SpecializationCourseReference[] = [];
  for (const option of rule.options) {
    if (option.kind === 'course') {
      result.push({ courseNumber: option.courseNumber, courseName: option.courseName, category: option.category });
    } else {
      result.push(...collectRuleOptions(option));
    }
  }
  return result;
}

export function applySpecializationGroupYearVariant(
  group: SpecializationGroup,
  variant: SpecializationGroupYearVariant,
): SpecializationGroup {
  const singleReq = group.requirementsByMode.single;
  if (!singleReq) return group;

  const courseMap = new Map(group.courses.map((c) => [c.courseNumber, c]));

  const resolvedMandatory = variant.mandatoryCourseIds !== undefined
    ? variant.mandatoryCourseIds
        .map((id) => courseMap.get(id))
        .filter((c): c is SpecializationCourseReference => c !== undefined)
    : singleReq.mandatoryCourses;

  const resolvedChoiceRules = variant.mandatoryChoiceGroups !== undefined
    ? variant.mandatoryChoiceGroups
        .filter((opts) => opts.length > 0)
        .map((opts): SpecializationChoiceRule => ({
          kind: 'choice_rule',
          type: 'choose_1_from',
          count: 1,
          options: opts
            .map((id) => courseMap.get(id))
            .filter((c): c is SpecializationCourseReference => c !== undefined)
            .map((c): SpecializationCourseOption => ({ kind: 'course', ...c })),
        }))
    : singleReq.mandatoryChoiceRules;

  const resolvedSingle: SpecializationRequirementSet = {
    ...singleReq,
    mandatoryCourses: resolvedMandatory,
    mandatoryChoiceRules: resolvedChoiceRules,
  };
  const resolvedReqsByMode = { ...group.requirementsByMode, single: resolvedSingle };
  const legacyLists = buildGroupLegacyLists(group.courses, resolvedReqsByMode);

  return {
    ...group,
    requirementsByMode: resolvedReqsByMode,
    mandatoryCourses: legacyLists.mandatoryCourses,
    mandatoryOptions: resolvedChoiceRules.map((rule) => collectRuleCourseNumbers(rule)),
    electiveCourses: legacyLists.electiveCourses,
  };
}

export function evaluateSpecializationGroup(
  group: SpecializationGroup,
  takenCourseNumbers: Iterable<string>,
  mode: SpecializationMode = 'single',
  courseChainAssignments?: Record<string, string>,
): SpecializationGroupEvaluation {
  const takenCourses = new Set(
    [...takenCourseNumbers].filter((id) => {
      const assignment = courseChainAssignments?.[id];
      return !assignment || assignment === group.id;
    }),
  );
  const requirements = group.requirementsByMode[mode] ?? group.requirementsByMode.single;

  if (!requirements) {
    return {
      groupId: group.id,
      groupName: group.name,
      mode,
      complete: false,
      doneCount: 0,
      requiredCount: 0,
      mandatoryCoursesSatisfied: false,
      mandatoryChoicesSatisfied: false,
      selectionRuleSatisfied: false,
      additionalRuleSatisfied: false,
      mutualExclusionSatisfied: false,
      matchedCourseNumbers: [],
      ruleBlocks: [],
      issues: ['חוקי ההתמחות אינם זמינים.'],
    };
  }

  const replacementMap = buildReplacementAliasMap(group);
  const mandatoryCourses = evaluateMandatoryCourses(requirements, takenCourses, replacementMap);
  const mandatoryChoices = requirements.mandatoryChoiceRules.map((rule) =>
    evaluateChoiceRule(rule, takenCourses, replacementMap),
  );
  const selectionRule = evaluateChoiceRule(requirements.selectionRule, takenCourses, replacementMap);
  const mutualExclusion = evaluateMutualExclusionRules(group.mutualExclusionRules, takenCourses);
  const allKnownCourseNumbers = collectTrackGroupCourseNumbers(group);
  const doneCount = allKnownCourseNumbers.filter((courseNumber) => takenCourses.has(courseNumber)).length;

  const ruleBlocks: SpecializationRuleBlock[] = [];

  if (requirements.mandatoryCourses.length > 0) {
    const satisfiedMandatoryCount = requirements.mandatoryCourses.filter(
      (course) => courseIsSatisfied(course.courseNumber, takenCourses, replacementMap).satisfied,
    ).length;
    ruleBlocks.push({
      id: 'mandatory_courses',
      kind: 'mandatory_courses',
      title: 'קורסי חובה',
      requiredCount: requirements.mandatoryCourses.length,
      satisfiedCount: satisfiedMandatoryCount,
      isSatisfied: mandatoryCourses.satisfied,
      options: requirements.mandatoryCourses,
      matchedCourseNumbers: mandatoryCourses.matchedCourseNumbers,
    });
  }

  requirements.mandatoryChoiceRules.forEach((rule, i) => {
    const ev = mandatoryChoices[i];
    ruleBlocks.push({
      id: `mandatory_choice_${i}`,
      kind: 'mandatory_choice',
      title: rule.groupName ?? `בחר ${rule.count} מתוך הקורסים הבאים`,
      requiredCount: rule.count,
      satisfiedCount: ev.satisfiedOptionCount,
      isSatisfied: ev.satisfied,
      options: collectRuleOptions(rule),
      matchedCourseNumbers: ev.matchedCourseNumbers,
      note: rule.note,
    });
  });

  if (requirements.selectionRule) {
    const rule = requirements.selectionRule;
    ruleBlocks.push({
      id: 'selection_rule',
      kind: 'selection_rule',
      title: rule.groupName ?? `בחר ${rule.count} קורסים`,
      requiredCount: rule.count,
      satisfiedCount: selectionRule.satisfiedOptionCount,
      isSatisfied: selectionRule.satisfied,
      options: collectRuleOptions(rule),
      matchedCourseNumbers: selectionRule.matchedCourseNumbers,
      note: rule.note,
    });
  }

  // Evaluate the additional rule against courses not already consumed by prior blocks.
  // Only the minimum required options are consumed per rule (minConsumedCourseNumbers), so
  // extra courses taken from a mandatory_choice list remain available for the additional slot.
  const consumedByPriorBlocks = new Set<string>([
    ...mandatoryCourses.matchedCourseNumbers,
    ...mandatoryChoices.flatMap((ev) => ev.minConsumedCourseNumbers),
    ...selectionRule.minConsumedCourseNumbers,
  ]);
  const remainingForAdditional = new Set([...takenCourses].filter((c) => !consumedByPriorBlocks.has(c)));
  const additionalRule = evaluateChoiceRule(
    requirements.additionalCourseSelectionRule,
    remainingForAdditional,
    replacementMap,
  );

  if (requirements.additionalCoursesRequired > 0 && requirements.additionalCourseSelectionRule) {
    ruleBlocks.push({
      id: 'additional_courses',
      kind: 'additional_courses',
      title: `יש להשלים עוד ${requirements.additionalCoursesRequired} קורסים מתוך הרשימה הבאה`,
      requiredCount: requirements.additionalCoursesRequired,
      satisfiedCount: additionalRule.satisfiedOptionCount,
      isSatisfied: additionalRule.satisfied,
      options: collectRuleOptions(requirements.additionalCourseSelectionRule),
      matchedCourseNumbers: additionalRule.matchedCourseNumbers,
      note: requirements.additionalCourseSelectionRule.note,
    });
  }

  const issues: string[] = [];
  if (!mandatoryCourses.satisfied) issues.push('קורסי החובה לא הושלמו.');
  if (!mandatoryChoices.every((evaluation) => evaluation.satisfied)) issues.push('חוקי בחירת החובה לא הושלמו.');
  if (!selectionRule.satisfied) issues.push('חוק הבחירה הראשי לא הושלם.');
  if (requirements.additionalCoursesRequired > 0 && !additionalRule.satisfied) issues.push('דרישת הקורסים הנוספים לא הושלמה.');
  if (!mutualExclusion.satisfied) issues.push(...mutualExclusion.issues);
  if (doneCount < requirements.totalCoursesRequiredForGroup) {
    issues.push(`נדרשים ${requirements.totalCoursesRequiredForGroup} קורסים, הושלמו ${doneCount}.`);
  }

  return {
    groupId: group.id,
    groupName: group.name,
    mode,
    complete:
      mandatoryCourses.satisfied &&
      mandatoryChoices.every((evaluation) => evaluation.satisfied) &&
      selectionRule.satisfied &&
      (requirements.additionalCoursesRequired === 0 || additionalRule.satisfied) &&
      mutualExclusion.satisfied &&
      doneCount >= requirements.totalCoursesRequiredForGroup,
    doneCount,
    requiredCount: requirements.totalCoursesRequiredForGroup,
    mandatoryCoursesSatisfied: mandatoryCourses.satisfied,
    mandatoryChoicesSatisfied: mandatoryChoices.every((evaluation) => evaluation.satisfied),
    selectionRuleSatisfied: selectionRule.satisfied,
    additionalRuleSatisfied: requirements.additionalCoursesRequired === 0 || additionalRule.satisfied,
    mutualExclusionSatisfied: mutualExclusion.satisfied,
    matchedCourseNumbers: dedupeCourseNumbers([
      ...mandatoryCourses.matchedCourseNumbers,
      ...mandatoryChoices.flatMap((evaluation) => evaluation.matchedCourseNumbers),
      ...selectionRule.matchedCourseNumbers,
      ...additionalRule.matchedCourseNumbers,
    ]),
    ruleBlocks,
    issues,
  };
}

export function sanitizeTrackSpecializationSelections(
  catalog: TrackSpecializationCatalog,
  state: SpecializationCatalogSelectionState,
): TrackSpecializationSelectionSanitization {
  const allowedIds = new Set(catalog.groups.map((group) => group.id));
  const selectedSpecializations = state.selectedSpecializations.filter((groupId) => allowedIds.has(groupId));
  const allowedDoubleIds = new Set(
    catalog.groups
      .filter((group) => group.canBeDouble && !catalog.interactionDisabled)
      .map((group) => group.id),
  );
  const doubleSpecializations = state.doubleSpecializations.filter((groupId) => allowedDoubleIds.has(groupId));

  return {
    selectedSpecializations,
    doubleSpecializations,
    removedSelectedSpecializations: state.selectedSpecializations.filter((groupId) => !allowedIds.has(groupId)),
    removedDoubleSpecializations: state.doubleSpecializations.filter((groupId) => !allowedDoubleIds.has(groupId)),
  };
}

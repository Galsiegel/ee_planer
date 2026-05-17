import { getAllSemesterEntryCourseIds } from '../data/tracks/semesterSchedule';
import type {
  SapCourse,
  SpecializationChoiceRule,
  SpecializationGroup,
  SpecializationRuleOption,
  TrackDefinition,
  TrackSpecializationCatalog,
} from '../types';
import { getAvailableYears, resolveTrackForYear } from './resolveTrack';

export interface MissingStaticCourseReference {
  courseId: string;
  source: string;
}

const REPORTED_SIGNATURES = new Set<string>();

function addCourseReference(
  refs: Map<string, Set<string>>,
  courseId: string | undefined,
  source: string,
): void {
  if (!courseId) return;
  const sources = refs.get(courseId) ?? new Set<string>();
  sources.add(source);
  refs.set(courseId, sources);
}

function collectTrackCourseReferences(
  refs: Map<string, Set<string>>,
  track: TrackDefinition,
  label: string,
): void {
  for (const entry of track.semesterSchedule) {
    for (const courseId of getAllSemesterEntryCourseIds(entry)) {
      addCourseReference(refs, courseId, `${label} semester ${entry.semester}`);
    }
  }

  for (const courseId of track.coreRequirement?.courses ?? []) {
    addCourseReference(refs, courseId, `${label} core requirement`);
  }

  for (const group of track.coreRequirement?.orGroups ?? []) {
    for (const courseId of group) {
      addCourseReference(refs, courseId, `${label} core alternative`);
    }
  }

  for (const courseId of track.labPool?.courses ?? []) {
    addCourseReference(refs, courseId, `${label} lab pool`);
  }

  for (const requirement of track.electivePolicy?.areaRequirements ?? []) {
    for (const courseId of requirement.allowedCourseIds ?? []) {
      addCourseReference(refs, courseId, `${label} elective area allowed list`);
    }
    for (const courseId of requirement.requiredAnyOfCourseIds ?? []) {
      addCourseReference(refs, courseId, `${label} elective area required-any-of`);
    }
  }
}

function collectRuleCourseReferences(
  refs: Map<string, Set<string>>,
  rule: SpecializationChoiceRule | null,
  source: string,
): void {
  if (!rule) return;
  for (const option of rule.options) {
    collectRuleOptionCourseReferences(refs, option, source);
  }
}

function collectRuleOptionCourseReferences(
  refs: Map<string, Set<string>>,
  option: SpecializationRuleOption,
  source: string,
): void {
  if (option.kind === 'course') {
    addCourseReference(refs, option.courseNumber, source);
    return;
  }
  collectRuleCourseReferences(refs, option, source);
}

function collectSpecializationGroupCourseReferences(
  refs: Map<string, Set<string>>,
  group: SpecializationGroup,
  label: string,
): void {
  for (const course of group.courses) {
    addCourseReference(refs, course.courseNumber, `${label} course list`);
  }
  for (const courseId of group.mandatoryCourses) {
    addCourseReference(refs, courseId, `${label} mandatory list`);
  }
  for (const courseId of group.electiveCourses) {
    addCourseReference(refs, courseId, `${label} elective list`);
  }
  for (const optionGroup of group.mandatoryOptions ?? []) {
    for (const courseId of optionGroup) {
      addCourseReference(refs, courseId, `${label} mandatory options`);
    }
  }
  for (const requirements of Object.values(group.requirementsByMode)) {
    if (!requirements) continue;
    for (const course of requirements.mandatoryCourses) {
      addCourseReference(refs, course.courseNumber, `${label} requirements mandatory`);
    }
    for (const rule of requirements.mandatoryChoiceRules) {
      collectRuleCourseReferences(refs, rule, `${label} requirements mandatory choice`);
    }
    collectRuleCourseReferences(refs, requirements.selectionRule, `${label} requirements selection`);
    collectRuleCourseReferences(refs, requirements.additionalCourseSelectionRule, `${label} requirements additional`);
  }
  for (const rule of group.replacementRules) {
    addCourseReference(refs, rule.replaceableCourse.courseNumber, `${label} replacement source`);
    for (const course of rule.allowedReplacements) {
      addCourseReference(refs, course.courseNumber, `${label} replacement target`);
    }
  }
  for (const rule of group.mutualExclusionRules) {
    for (const course of rule.options) {
      addCourseReference(refs, course.courseNumber, `${label} mutual exclusion`);
    }
  }
}

export function collectMissingStaticCourseReferences(
  tracks: TrackDefinition[],
  courses: Map<string, SapCourse>,
  getSpecializationCatalog?: (track: TrackDefinition, catalogYear: number | null) => TrackSpecializationCatalog,
): MissingStaticCourseReference[] {
  const refs = new Map<string, Set<string>>();

  for (const track of tracks) {
    const years = getAvailableYears(track);
    const catalogYears = years.length > 0 ? years : [null];
    for (const catalogYear of catalogYears) {
      const resolvedTrack = resolveTrackForYear(track, catalogYear);
      const label = catalogYear ? `${track.id}/${catalogYear}` : track.id;
      collectTrackCourseReferences(refs, resolvedTrack, label);

      if (getSpecializationCatalog) {
        const catalog = getSpecializationCatalog(track, catalogYear);
        for (const group of catalog.groups) {
          collectSpecializationGroupCourseReferences(refs, group, `${label} specialization ${group.name}`);
        }
      }
    }
  }

  return [...refs.entries()]
    .filter(([courseId]) => !courses.has(courseId))
    .map(([courseId, sources]) => ({ courseId, source: [...sources].sort().join('; ') }))
    .sort((a, b) => a.courseId.localeCompare(b.courseId));
}

export function reportMissingStaticCourseReferences(
  tracks: TrackDefinition[],
  courses: Map<string, SapCourse>,
  getSpecializationCatalog?: (track: TrackDefinition, catalogYear: number | null) => TrackSpecializationCatalog,
): void {
  const missing = collectMissingStaticCourseReferences(tracks, courses, getSpecializationCatalog);
  if (missing.length === 0) return;

  const signature = missing.map((ref) => `${ref.courseId}:${ref.source}`).join('|');
  if (REPORTED_SIGNATURES.has(signature)) return;
  REPORTED_SIGNATURES.add(signature);

  console.warn(
    `[static-course-data] ${missing.length} static course references are missing from the loaded course catalog.`,
    missing,
  );
}

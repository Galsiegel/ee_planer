import type { SapCourse, TrackDefinition, TrackSpecializationCatalog } from '../../types';
import type { RequirementsInput } from './types';
import {
  getSatisfiedAlternativeCourseId,
  getVisibleMandatoryCourseIds,
} from '../../data/tracks/semesterSchedule';
import {
  isChoirOrOrchestraCourseId,
  isFreeElectiveCourseId,
  isRegularSportCourseId,
  isSportCourseId,
  isSportsTeamCourseId,
} from '../../data/generalRequirements/courseClassification';
import {
  allocateElectiveCredits,
  EXTERNAL_FACULTY_ELECTIVE_MAX_CREDITS,
  resolveElectiveCreditArea,
} from '../electives';
import { REPEATABLE_COURSES } from '../../utils/courseGrades';
import { bareId } from '../../utils/occurrenceId';
import { calculateSpecialEnrichmentAllocation } from '../generalRequirements/specialAllocation';
import type { GeneralElectivesBreakdown } from '../generalRequirements/types';
import {
  computeNoAdditionalCreditConflicts,
  getNoAdditionalCreditCourseIds,
} from '../noAdditionalCredit';
import {
  CE_PROJECT_A_ID,
  CE_PROJECT_B_ID,
  getCeProjectRequirementProfile,
} from '../ceProjectRequirements';
import type {
  CourseAssignment,
  DegreeBucket,
  DegreeRequirementCheck,
  DegreeRequirementStatus,
} from './types';

type CoreLockInput = Pick<RequirementsInput, 'completedCourses' | 'semesters' | 'coreToChainOverrides' | 'courseChainAssignments'>;

/**
 * Structural shape of `computeRequirementsProgress` output that
 * `buildRequirementChecks` consumes. Defined locally so this module
 * stays free of any runtime dependency on `usePlan.ts`.
 */
export interface DegreeProgressShape {
  mandatory: { earned: number; required: number };
  elective: { earned: number; required: number };
  total: { earned: number; required: number };
  specializationGroups: { completed: number; required: number; unavailable: boolean };
  general: { earned: number; required: number };
  generalElectivesBreakdown: GeneralElectivesBreakdown;
  labPoolProgress:
    | { earned: number; required: number; mandatory: boolean; max?: number }
    | null;
  coreRequirementProgress:
    | { completed: number; required: number; total: number }
    | null;
  english: {
    score: number | undefined;
    hasExemption: boolean;
    requirements: ReadonlyArray<{ done: boolean }>;
    englishInPlan: string[];
  };
  isReady: boolean;
}

function buildAllPlaced(input: Pick<RequirementsInput, 'completedCourses' | 'semesters'>): Set<string> {
  const all = new Set<string>(input.completedCourses);
  for (const ids of Object.values(input.semesters)) {
    for (const id of ids) all.add(id);
  }
  return all;
}

/**
 * Returns the course IDs that actually contribute to mandatory credits.
 * Narrower than `getVisibleMandatoryCourseIds` because it excludes
 * unsatisfied alternative-group members and only counts the satisfied
 * winner of each alternative group.
 *
 * Mandatory labs are NOT included here — `buildLabSets` handles them.
 */
export function buildPreciseMandatorySet(
  input: RequirementsInput,
  courses: Map<string, SapCourse>,
  trackDef: TrackDefinition,
): Set<string> {
  const allPlaced = buildAllPlaced(input);
  const visibleIds = getVisibleMandatoryCourseIds(trackDef, courses, input.englishScore);
  const result = new Set<string>();
  const ceMandatoryProjectIds = trackDef.id === 'ce'
    ? new Set(getCeProjectRequirementProfile(trackDef, allPlaced, courses).mandatoryProjectCourseIds)
    : new Set<string>();

  for (const entry of trackDef.semesterSchedule) {
    for (const id of entry.courses) {
      if (trackDef.id === 'ce' && (id === CE_PROJECT_A_ID || id === CE_PROJECT_B_ID)) {
        continue;
      }
      if (visibleIds.has(id) && allPlaced.has(id)) {
        result.add(id);
      }
    }

    for (const group of entry.alternativeGroups ?? []) {
      const satisfiedId = getSatisfiedAlternativeCourseId(
        group,
        allPlaced,
        courses,
        input.englishScore,
      );
      if (satisfiedId) result.add(satisfiedId);
    }
  }

  for (const id of ceMandatoryProjectIds) {
    result.add(id);
  }

  return result;
}

/**
 * Replicates the lab classification from `computeRequirementsProgress`:
 * iterate completedCourses then `semesterOrder`-ordered semesters, capping
 * at `labPool.max`. The first `labPool.required` entries become mandatory
 * labs (when `labPool.mandatory === true`); the rest are optional. Lab-pool
 * courses placed beyond `max` are excess.
 */
export function buildLabSets(
  input: RequirementsInput,
  trackDef: TrackDefinition,
): {
  mandatoryLabIds: Set<string>;
  optionalLabIds: Set<string>;
  excessLabIds: Set<string>;
} {
  if (!trackDef.labPool) {
    return {
      mandatoryLabIds: new Set(),
      optionalLabIds: new Set(),
      excessLabIds: new Set(),
    };
  }

  const labSet = new Set(trackDef.labPool.courses);
  const max = trackDef.labPool.max ?? trackDef.labPool.courses.length;
  const required = trackDef.labPool.required;

  const orderedLabPool: string[] = [];
  const seen = new Set<string>();

  for (const id of input.completedCourses) {
    if (labSet.has(id) && !seen.has(id)) {
      orderedLabPool.push(id);
      seen.add(id);
    }
  }

  for (const sem of input.semesterOrder) {
    for (const id of input.semesters[sem] ?? []) {
      if (labSet.has(id) && !seen.has(id)) {
        orderedLabPool.push(id);
        seen.add(id);
      }
    }
    if (orderedLabPool.length >= max) break;
  }

  if (orderedLabPool.length > max) orderedLabPool.splice(max);

  const mandatoryLabIds = new Set<string>();
  if (trackDef.labPool.mandatory) {
    for (let i = 0; i < Math.min(required, orderedLabPool.length); i++) {
      mandatoryLabIds.add(orderedLabPool[i]);
    }
  }

  const optionalLabIds = new Set<string>();
  for (const id of orderedLabPool) {
    if (!mandatoryLabIds.has(id)) optionalLabIds.add(id);
  }

  const excessLabIds = new Set<string>();
  const orderedSet = new Set(orderedLabPool);
  for (const id of buildAllPlaced(input)) {
    if (labSet.has(id) && !orderedSet.has(id)) excessLabIds.add(id);
  }

  return { mandatoryLabIds, optionalLabIds, excessLabIds };
}

/**
 * Replicates the `coreLockedSet` logic from `computeRequirementsProgress`:
 * core-requirement courses placed and not released to chain via
 * `coreToChainOverrides`. For OR groups, only the first found member is
 * locked — siblings are blocked even if also placed.
 */
export function buildCoreLockedSet(
  input: CoreLockInput,
  trackDef: TrackDefinition,
): Set<string> {
  if (!trackDef.coreRequirement) return new Set();

  const allPlaced = buildAllPlaced(input);
  const { courses: coreCourseIds, orGroups = [] } = trackDef.coreRequirement;
  const corePlaced = coreCourseIds.filter((id) => allPlaced.has(id));
  const coreLocked = corePlaced.filter((id) =>
    !input.coreToChainOverrides.includes(id) && !input.courseChainAssignments?.[id],
  );

  const blockedOrIds = new Set<string>();
  for (const group of orGroups) {
    let foundActive = false;
    for (const id of group) {
      if (coreLocked.includes(id)) {
        if (!foundActive) foundActive = true;
        else blockedOrIds.add(id);
      }
    }
  }

  const result = new Set<string>();
  for (const id of coreLocked) {
    if (!blockedOrIds.has(id)) result.add(id);
  }
  return result;
}

export function buildChainEligibleCourseSet(
  input: CoreLockInput,
  trackDef: TrackDefinition,
): Set<string> {
  const allPlaced = buildAllPlaced(input);
  if (!trackDef.coreRequirement) return allPlaced;

  const coreLockedSet = buildCoreLockedSet(input, trackDef);
  return new Set([...allPlaced].filter((id) => !coreLockedSet.has(id)));
}

/**
 * Iteration order matches `computeRequirementsProgress`: completedCourses
 * first, then `semesterOrder`-ordered semesters, then any other semesters.
 * Non-repeatable IDs are deduped via a `seen` set; repeatable IDs are
 * collected as one assignment per unique ID (the bucket itself is the
 * same regardless of how many times the course is placed).
 */
function iterateAllPlacedOrdered(input: RequirementsInput): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const visit = (id: string): void => {
    if (REPEATABLE_COURSES.has(id)) {
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
      return;
    }
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  for (const id of input.completedCourses) visit(id);
  for (const sem of input.semesterOrder) {
    for (const id of input.semesters[sem] ?? []) visit(id);
  }
  // Catch any semester not in semesterOrder (e.g., the unassigned pool 0).
  for (const [key, ids] of Object.entries(input.semesters)) {
    const sem = Number(key);
    if (input.semesterOrder.includes(sem)) continue;
    for (const id of ids) visit(id);
  }

  return ordered;
}

function buildCourseToSpecGroups(
  catalog: TrackSpecializationCatalog,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const group of catalog.groups) {
    for (const course of group.courses) {
      const existing = map.get(course.courseNumber);
      if (existing) {
        if (!existing.includes(group.id)) existing.push(group.id);
      } else {
        map.set(course.courseNumber, [group.id]);
      }
    }
  }
  return map;
}

function normalizeCourse(course: SapCourse): SapCourse {
  return {
    ...course,
    faculty: course.faculty ?? '',
    prerequisites: course.prerequisites ?? [],
  };
}

function buildSpecialRecognizedCreditsByCourseId(
  input: RequirementsInput,
  courses: Map<string, SapCourse>,
): Map<string, number> {
  const specialOccurrences: Array<{ id: string; credits: number }> = [];
  const visit = (id: string): void => {
    if (!isChoirOrOrchestraCourseId(id) && !isSportsTeamCourseId(id)) return;
    specialOccurrences.push({ id, credits: courses.get(bareId(id))?.credits ?? 0 });
  };

  for (const id of input.completedCourses) {
    if (isChoirOrOrchestraCourseId(id) || isSportsTeamCourseId(id)) continue;
    visit(id);
  }
  for (const ids of Object.values(input.semesters)) {
    for (const id of ids) {
      visit(id);
    }
  }

  const choirOrOrchestraCredits = specialOccurrences.reduce(
    (sum, occurrence) =>
      sum + (isChoirOrOrchestraCourseId(occurrence.id) ? occurrence.credits : 0),
    0,
  );
  const sportsTeamCredits = specialOccurrences.reduce(
    (sum, occurrence) => sum + (isSportsTeamCourseId(occurrence.id) ? occurrence.credits : 0),
    0,
  );
  const allocation = calculateSpecialEnrichmentAllocation({
    choirOrOrchestraCredits,
    sportsTeamCredits,
  });

  let remainingChoirOrOrchestra = allocation.recognizedChoirOrOrchestraCredits;
  let remainingSportsTeam = allocation.recognizedSportsTeamCredits;
  const result = new Map<string, number>();

  for (const occurrence of specialOccurrences) {
    let recognizedCredits = 0;
    if (isChoirOrOrchestraCourseId(occurrence.id)) {
      recognizedCredits = Math.min(occurrence.credits, remainingChoirOrOrchestra);
      remainingChoirOrOrchestra -= recognizedCredits;
    } else if (isSportsTeamCourseId(occurrence.id)) {
      recognizedCredits = Math.min(occurrence.credits, remainingSportsTeam);
      remainingSportsTeam -= recognizedCredits;
    }

    if (recognizedCredits > 0) {
      result.set(occurrence.id, (result.get(occurrence.id) ?? 0) + recognizedCredits);
    }
  }

  return result;
}

/**
 * Assigns each placed course to exactly one bucket (highest-priority match
 * wins). Buckets mirror the credit-counting buckets used inside
 * `computeRequirementsProgress`, plus an `uncounted` bucket for placed
 * courses that contribute to no requirement (e.g., unsatisfied alt-group
 * members).
 */
export function buildCourseAssignments(
  input: RequirementsInput,
  courses: Map<string, SapCourse>,
  trackDef: TrackDefinition,
  catalog: TrackSpecializationCatalog,
): CourseAssignment[] {
  const preciseMandatorySet = buildPreciseMandatorySet(input, courses, trackDef);
  const { mandatoryLabIds, optionalLabIds, excessLabIds } = buildLabSets(input, trackDef);
  const coreLockedSet = buildCoreLockedSet(input, trackDef);
  const visibleMandatoryIds = getVisibleMandatoryCourseIds(
    trackDef,
    courses,
    input.englishScore,
  );
  const courseToSpecGroups = buildCourseToSpecGroups(catalog);
  const specialRecognizedCreditsByCourseId = buildSpecialRecognizedCreditsByCourseId(
    input,
    courses,
  );
  const noAdditionalCreditCourseIds = getNoAdditionalCreditCourseIds(
    computeNoAdditionalCreditConflicts(courses, {
      completedCourses: input.completedCourses,
      semesters: input.semesters,
      semesterOrder: input.semesterOrder,
      noAdditionalCreditOverrides: input.noAdditionalCreditOverrides,
    }),
  );

  const assignments: CourseAssignment[] = [];
  let externalFacultyElectiveCredits = 0;

  for (const id of iterateAllPlacedOrdered(input)) {
    let bucket: DegreeBucket;
    let credits = courses.get(bareId(id))?.credits ?? 0;
    const isMandatoryOnlyBecauseScheduledCeProject =
      trackDef.id === 'ce' &&
      (id === CE_PROJECT_A_ID || id === CE_PROJECT_B_ID) &&
      visibleMandatoryIds.has(id) &&
      !preciseMandatorySet.has(id);

    if (noAdditionalCreditCourseIds.has(id)) {
      bucket = 'uncounted';
      credits = 0;
    } else if (preciseMandatorySet.has(id)) {
      bucket = 'mandatory';
    } else if (mandatoryLabIds.has(id)) {
      bucket = 'mandatory_lab';
    } else if (excessLabIds.has(id)) {
      bucket = 'excess_lab';
    } else if (optionalLabIds.has(id)) {
      bucket = 'optional_lab';
    } else if (coreLockedSet.has(id)) {
      bucket = 'core';
    } else if (isChoirOrOrchestraCourseId(id) || isSportsTeamCourseId(id)) {
      const recognizedCredits = specialRecognizedCreditsByCourseId.get(id) ?? 0;
      bucket = recognizedCredits > 0 ? 'special_general' : 'uncounted';
      credits = recognizedCredits;
    } else if (isSportCourseId(id)) {
      bucket = isRegularSportCourseId(id) ? 'sport' : 'uncounted';
    } else if (isFreeElectiveCourseId(id)) {
      bucket = 'melag';
    } else if (visibleMandatoryIds.has(id) && !isMandatoryOnlyBecauseScheduledCeProject) {
      // Visible mandatory course that didn't make it into preciseMandatorySet:
      // most commonly the losing alternative in an alternativeGroup. These
      // contribute to neither mandatory nor elective credits.
      bucket = 'uncounted';
    } else {
      const course = courses.get(id);
      if (!course) {
        bucket = 'uncounted';
      } else {
        const normalizedCourse = normalizeCourse(course);
        const selectedArea = resolveElectiveCreditArea(
          normalizedCourse,
          trackDef,
          input.electiveCreditAssignments,
        );
        const split = allocateElectiveCredits(
          normalizedCourse,
          selectedArea,
          courseToSpecGroups.has(id),
          EXTERNAL_FACULTY_ELECTIVE_MAX_CREDITS - externalFacultyElectiveCredits,
        );
        externalFacultyElectiveCredits += split.externalFacultyCredits;
        const specializationGroupIds = courseToSpecGroups.get(id) ?? [];

        if (split.facultyCredits > 0) {
          assignments.push({
            courseId: id,
            bucket: 'faculty_elective',
            credits: split.facultyCredits,
            specializationGroupIds,
          });
        }
        if (split.generalCredits > 0) {
          assignments.push({
            courseId: id,
            bucket: 'general_elective',
            credits: split.generalCredits,
            specializationGroupIds,
          });
        }
        if (split.facultyCredits > 0 || split.generalCredits > 0) continue;

        bucket = 'uncounted';
        credits = 0;
      }
    }

    const specializationGroupIds = courseToSpecGroups.get(id) ?? [];

    assignments.push({ courseId: id, bucket, credits, specializationGroupIds });
  }

  return assignments;
}

function deriveStatus(earned: number, required: number): DegreeRequirementStatus {
  if (required <= 0) return 'completed';
  if (earned >= required) return 'completed';
  if (earned > 0) return 'partial';
  return 'missing';
}

function idsForBuckets(
  assignments: CourseAssignment[],
  buckets: DegreeBucket[],
): string[] {
  const set = new Set(buckets);
  return assignments.filter((a) => set.has(a.bucket)).map((a) => a.courseId);
}

/**
 * Translates the structural progress object (output of
 * `computeRequirementsProgress`) into a flat list of
 * `DegreeRequirementCheck` entries for the degree completion check API.
 */
export function buildRequirementChecks(
  progress: DegreeProgressShape,
  assignments: CourseAssignment[],
): DegreeRequirementCheck[] {
  const checks: DegreeRequirementCheck[] = [];

  checks.push({
    id: 'mandatory_credits',
    title: 'קורסי חובה',
    earned: progress.mandatory.earned,
    required: progress.mandatory.required,
    unit: 'credits',
    status: deriveStatus(progress.mandatory.earned, progress.mandatory.required),
    missingValue: Math.max(0, progress.mandatory.required - progress.mandatory.earned),
    countedCourseIds: idsForBuckets(assignments, ['mandatory', 'mandatory_lab']),
  });

  checks.push({
    id: 'elective_credits',
    title: 'קורסי בחירה פקולטית',
    earned: progress.elective.earned,
    required: progress.elective.required,
    unit: 'credits',
    status: deriveStatus(progress.elective.earned, progress.elective.required),
    missingValue: Math.max(0, progress.elective.required - progress.elective.earned),
    countedCourseIds: idsForBuckets(assignments, ['faculty_elective', 'optional_lab', 'core']),
  });

  // Excess faculty elective credits (beyond required) may overflow into the
  // free-choice sub-bucket only — not into the sport or enrichment floors.
  const facultyExcess = Math.max(0, progress.elective.earned - progress.elective.required);

  checks.push({
    id: 'total_credits',
    title: 'סך נקודות זכות',
    earned: progress.total.earned,
    required: progress.total.required,
    unit: 'credits',
    status: deriveStatus(progress.total.earned, progress.total.required),
    missingValue: Math.max(0, progress.total.required - progress.total.earned),
    countedCourseIds: assignments
      .filter((a) => a.bucket !== 'excess_lab' && a.bucket !== 'uncounted')
      .map((a) => a.courseId),
  });

  if (!progress.specializationGroups.unavailable) {
    checks.push({
      id: 'specialization_groups',
      title: 'קבוצות התמחות',
      earned: progress.specializationGroups.completed,
      required: progress.specializationGroups.required,
      unit: 'groups',
      status: deriveStatus(
        progress.specializationGroups.completed,
        progress.specializationGroups.required,
      ),
      missingValue: Math.max(
        0,
        progress.specializationGroups.required - progress.specializationGroups.completed,
      ),
      countedCourseIds: assignments
        .filter((a) => a.specializationGroupIds.length > 0)
        .map((a) => a.courseId),
    });
  }

  const breakdown = progress.generalElectivesBreakdown;
  const freeChoiceGap = Math.max(0, breakdown.freeChoice.target - breakdown.freeChoice.recognized);
  const overflowApplied = Math.min(facultyExcess, freeChoiceGap);
  const generalEarnedAdjusted = breakdown.total.recognized + overflowApplied;
  checks.push({
    id: 'general_elective',
    title: 'קורסי בחירה כלל-טכניוניים',
    earned: generalEarnedAdjusted,
    required: breakdown.total.target,
    unit: 'credits',
    status: deriveStatus(generalEarnedAdjusted, breakdown.total.target),
    missingValue: Math.max(0, breakdown.total.target - generalEarnedAdjusted),
    countedCourseIds: idsForBuckets(assignments, ['sport', 'melag', 'special_general', 'general_elective']),
  });

  if (breakdown.sportFloor.target > 0) {
    checks.push({
      id: 'general_elective_sport_floor',
      title: 'כלל-טכניוניים — ספורט (חובה)',
      earned: breakdown.sportFloor.recognized,
      required: breakdown.sportFloor.target,
      unit: 'credits',
      status: deriveStatus(breakdown.sportFloor.recognized, breakdown.sportFloor.target),
      missingValue: Math.max(0, breakdown.sportFloor.target - breakdown.sportFloor.recognized),
      countedCourseIds: idsForBuckets(assignments, ['sport']),
    });
  }

  if (breakdown.enrichmentFloor.target > 0) {
    checks.push({
      id: 'general_elective_enrichment_floor',
      title: 'כלל-טכניוניים — מקצועות העשרה / מל"ג',
      earned: breakdown.enrichmentFloor.recognized,
      required: breakdown.enrichmentFloor.target,
      unit: 'credits',
      status: deriveStatus(breakdown.enrichmentFloor.recognized, breakdown.enrichmentFloor.target),
      missingValue: Math.max(0, breakdown.enrichmentFloor.target - breakdown.enrichmentFloor.recognized),
      countedCourseIds: idsForBuckets(assignments, ['melag']),
    });
  }

  if (progress.labPoolProgress) {
    const lab = progress.labPoolProgress;
    checks.push({
      id: 'labs',
      title: 'מעבדות',
      earned: lab.earned,
      required: lab.required,
      unit: 'courses',
      status: deriveStatus(lab.earned, lab.required),
      missingValue: Math.max(0, lab.required - lab.earned),
      countedCourseIds: idsForBuckets(assignments, ['mandatory_lab', 'optional_lab']),
    });
  }

  if (progress.coreRequirementProgress) {
    const core = progress.coreRequirementProgress;
    checks.push({
      id: 'core_requirement',
      title: 'דרישות ליבה',
      earned: core.completed,
      required: core.required,
      unit: 'courses',
      status: deriveStatus(core.completed, core.required),
      missingValue: Math.max(0, core.required - core.completed),
      countedCourseIds: idsForBuckets(assignments, ['core']),
    });
  }

  const englishItems = progress.english.requirements;
  if (progress.english.hasExemption || englishItems.length > 0) {
    const earned = progress.english.hasExemption
      ? englishItems.length
      : englishItems.filter((item) => item.done).length;
    const required = englishItems.length;
    checks.push({
      id: 'english',
      title: 'אנגלית',
      earned,
      required,
      unit: 'courses',
      status: progress.english.hasExemption
        ? 'completed'
        : deriveStatus(earned, required),
      missingValue: progress.english.hasExemption ? 0 : Math.max(0, required - earned),
      countedCourseIds: progress.english.englishInPlan,
    });
  }

  return checks;
}

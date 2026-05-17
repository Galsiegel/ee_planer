import type { StudentPlan } from '../types';

function cloneSemesterMap(semesters: Record<number, string[]>): Record<number, string[]> {
  return Object.fromEntries(Object.entries(semesters).map(([semester, courseIds]) => [Number(semester), [...courseIds]]));
}

function cloneStringArrayMap(value: Record<string, string[]> | undefined): Record<string, string[]> | undefined {
  if (!value) return value;
  return Object.fromEntries(Object.entries(value).map(([key, items]) => [key, [...items]]));
}

export function serializePlanState(state: StudentPlan): StudentPlan {
  return {
    trackId: state.trackId,
    semesters: cloneSemesterMap(state.semesters),
    completedCourses: [...state.completedCourses],
    selectedSpecializations: [...state.selectedSpecializations],
    favorites: [...state.favorites],
    grades: { ...state.grades },
    substitutions: { ...state.substitutions },
    maxSemester: state.maxSemester,
    selectedPrereqGroups: cloneStringArrayMap(state.selectedPrereqGroups) ?? {},
    summerSemesters: [...state.summerSemesters],
    currentSemester: state.currentSemester,
    semesterOrder: [...state.semesterOrder],
    semesterTypeOverrides: { ...(state.semesterTypeOverrides ?? {}) },
    semesterWarningsIgnored: [...(state.semesterWarningsIgnored ?? [])],
    doubleSpecializations: [...(state.doubleSpecializations ?? [])],
    hasEnglishExemption: state.hasEnglishExemption ?? false,
    manualSapAverages: { ...(state.manualSapAverages ?? {}) },
    binaryPass: { ...(state.binaryPass ?? {}) },
    explicitSportCompletions: [...(state.explicitSportCompletions ?? [])],
    completedInstances: [...(state.completedInstances ?? [])],
    savedTracks: state.savedTracks ? { ...state.savedTracks } : undefined,
    miluimCredits: state.miluimCredits,
    englishScore: state.englishScore,
    englishTaughtCourses: [...(state.englishTaughtCourses ?? [])],
    dismissedRecommendedCourses: cloneStringArrayMap(state.dismissedRecommendedCourses) ?? {},
    facultyColorOverrides: { ...(state.facultyColorOverrides ?? {}) },
    coreToChainOverrides: [...(state.coreToChainOverrides ?? [])],
    courseChainAssignments: { ...(state.courseChainAssignments ?? {}) },
    electiveCreditAssignments: { ...(state.electiveCreditAssignments ?? {}) },
    noAdditionalCreditOverrides: { ...(state.noAdditionalCreditOverrides ?? {}) },
    roboticsMinorEnabled: state.roboticsMinorEnabled ?? false,
    entrepreneurshipMinorEnabled: state.entrepreneurshipMinorEnabled ?? false,
    quantumComputingMinorEnabled: state.quantumComputingMinorEnabled ?? false,
    initializedTracks: [...(state.initializedTracks ?? [])],
    targetGraduationSemesterId: state.targetGraduationSemesterId ?? null,
    loadProfile: state.loadProfile ?? 'fulltime',
    catalogYear: state.catalogYear ?? null,
  };
}

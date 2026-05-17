export type TrackId = 'ee' | 'cs' | 'ee_math' | 'ee_physics' | 'ee_combined' | 'ce';

export type CourseFacultyArea =
  | 'ee'
  | 'math'
  | 'physics'
  | 'cs'
  | 'humanities'
  | 'other'
  | 'unknown';

export type ElectiveCreditArea = 'ee' | 'physics' | 'math' | 'general';

export interface ElectiveAreaRequirement {
  area: Exclude<ElectiveCreditArea, 'general'>;
  minCredits: number;
  allowedCourseIds?: string[];
  requiredAnyOfCourseIds?: string[];
}

export interface ElectiveCreditSplit {
  facultyCredits: number;
  generalCredits: number;
  areaCredits?: Partial<Record<Exclude<ElectiveCreditArea, 'general'>, number>>;
  externalFacultyCredits: number;
}

export interface TrackElectivePolicy {
  facultyCourseAreas: CourseFacultyArea[];
  areaRequirements?: ElectiveAreaRequirement[];
  manualAssignmentAreas?: Partial<Record<CourseFacultyArea, ElectiveCreditArea[]>>;
}

export interface SapCourse {
  id: string;
  name: string;
  credits: number;
  prerequisites: string[][];  // OR groups: [[A,B],[C]] = "(A AND B) OR C"
  noAdditionalCreditIds?: string[];
  examMoed1?: string;
  examMoed2?: string;
  faculty: string;
  syllabus?: string;
  teachingSemester?: 'winter' | 'spring';  // undefined = both
  isEnglish?: boolean;
  sapAverage?: number;  // grade average from SAP data, if available
}

export interface SemesterScheduleAlternativeGroup {
  courseIds: string[];
  showBoth?: boolean;
  defaultCourseId?: string;
  warningText?: string;
}

export interface SemesterScheduleEntry {
  semester: number;
  courses: string[];
  alternativeGroups?: SemesterScheduleAlternativeGroup[];
}

export interface TrackDefinition {
  id: TrackId;
  name: string;
  totalCreditsRequired: number;
  mandatoryCredits: number;
  electiveCreditsRequired: number;
  generalCreditsRequired: number;
  semesterSchedule: SemesterScheduleEntry[];
  specializationGroupsRequired: number;
  description: string;
  electivePolicy?: TrackElectivePolicy;
  labPool?: {
    courses: string[];
    required: number;     // mandatory minimum (0 = purely optional)
    mandatory?: boolean;  // true → first `required` placed labs count as mandatory credits
    max?: number;         // max labs that count for any credit (beyond this = uncredited)
  };
  coreRequirement?: {
    courses: string[];
    required: number;     // "complete N out of courses.length"
    orGroups?: string[][];  // each inner array = mutually exclusive alternatives (only 1 slot counts)
  };
  yearVariants?: Record<number, TrackYearVariant>;  // key = entry year (e.g. 2021)
}

export interface TrackYearVariant {
  totalCreditsRequired?: number;
  mandatoryCredits?: number;
  electiveCreditsRequired?: number;
  generalCreditsRequired?: number;
  specializationGroupsRequired?: number;
  semesterSchedule?: SemesterScheduleEntry[];
  coreRequirement?: TrackDefinition['coreRequirement'];
  labPool?: TrackDefinition['labPool'];
  electivePolicy?: TrackElectivePolicy;
}

export interface SpecializationCourseReference {
  courseNumber: string;
  courseName: string;
  category?: string;
}

export interface SpecializationChoiceRule {
  kind: 'choice_rule';
  type: string;
  count: number;
  options: SpecializationRuleOption[];
  note?: string;
  groupName?: string;
}

export interface SpecializationCourseOption extends SpecializationCourseReference {
  kind: 'course';
}

export type SpecializationRuleOption =
  | SpecializationChoiceRule
  | SpecializationCourseOption;

export interface SpecializationReplacementRule {
  replaceableCourse: SpecializationCourseReference;
  allowedReplacements: SpecializationCourseReference[];
  note?: string;
}

export interface SpecializationMutualExclusionRule {
  type: string;
  count: number;
  options: SpecializationCourseReference[];
  note?: string;
}

export interface SpecializationRequirementSet {
  totalCoursesRequiredForGroup: number;
  mandatoryCourses: SpecializationCourseReference[];
  mandatoryChoiceRules: SpecializationChoiceRule[];
  selectionRule: SpecializationChoiceRule | null;
  additionalCoursesRequired: number;
  additionalCourseSelectionRule: SpecializationChoiceRule | null;
  logicalExpression: string | null;
}

export type SpecializationRuleBlockKind =
  | 'mandatory_courses'
  | 'mandatory_choice'
  | 'selection_rule'
  | 'additional_courses';

export interface SpecializationRuleBlock {
  id: string;
  kind: SpecializationRuleBlockKind;
  title: string;
  requiredCount: number;
  satisfiedCount: number;
  isSatisfied: boolean;
  options: SpecializationCourseReference[];
  matchedCourseNumbers: string[];
  note?: string;
}

export type SpecializationMode = 'single' | 'double';
export type SpecializationGroupModeState = 'single_only' | 'single_and_double';

export interface SpecializationDiagnostic {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  trackId?: TrackId;
  filePath?: string;
  specializationName?: string;
}

export interface SpecializationGroupYearVariant {
  mandatoryCourseIds?: string[];   // replaces mandatory_courses for single mode
  mandatoryChoiceGroups?: string[][];  // replaces mandatory_choice_rules: outer=rules, inner=choose-1-from options
}

export interface SpecializationGroup {
  id: string;
  trackId: TrackId;
  title: string;
  name: string;
  sourceFile: string;
  courses: SpecializationCourseReference[];
  mandatoryCourses: string[];
  mandatoryOptions?: string[][];
  electiveCourses: string[];
  minCoursesToComplete: number;
  doubleMinCoursesToComplete?: number;
  notes: string[];
  modeState: SpecializationGroupModeState;
  supportedModes: SpecializationMode[];
  canBeDouble: boolean;
  requirementsByMode: Record<SpecializationMode, SpecializationRequirementSet | null>;
  mutualExclusionRules: SpecializationMutualExclusionRule[];
  replacementRules: SpecializationReplacementRule[];
  diagnostics: SpecializationDiagnostic[];
}

export interface TrackSpecializationCatalog {
  trackId: TrackId;
  trackFolder: string;
  groups: SpecializationGroup[];
  diagnostics: SpecializationDiagnostic[];
  hasErrors: boolean;
  interactionDisabled: boolean;
}

export interface SpecializationRuleEvaluation {
  satisfied: boolean;
  satisfiedOptionCount: number;
  requiredOptionCount: number;
  matchedCourseNumbers: string[];
}

export interface SpecializationGroupEvaluation {
  groupId: string;
  groupName: string;
  mode: SpecializationMode;
  complete: boolean;
  doneCount: number;
  requiredCount: number;
  mandatoryCoursesSatisfied: boolean;
  mandatoryChoicesSatisfied: boolean;
  selectionRuleSatisfied: boolean;
  additionalRuleSatisfied: boolean;
  mutualExclusionSatisfied: boolean;
  matchedCourseNumbers: string[];
  ruleBlocks: SpecializationRuleBlock[];
  issues: string[];
}

export interface SpecializationCatalogSelectionState {
  selectedSpecializations: string[];
  doubleSpecializations: string[];
}

export interface TrackSpecializationSelectionSanitization
  extends SpecializationCatalogSelectionState {
  removedSelectedSpecializations: string[];
  removedDoubleSpecializations: string[];
}

export interface PlanVersion {
  id: string;
  name: string;
  plan: StudentPlan;
  createdAt: number;
  updatedAt: number;
}

export interface VersionedPlanEnvelope {
  schemaVersion: 2;
  versions: PlanVersion[];
  activeVersionId: string;
}

export interface ShareReviewState {
  shareId: string;
  shareUpdatedAt: number;
  envelope: VersionedPlanEnvelope;
  loadedAt: number;
  isNew: boolean;
}

export interface StudentPlan {
  trackId: TrackId | null;
  semesters: Record<number, string[]>;
  completedCourses: string[];
  selectedSpecializations: string[];
  favorites: string[];
  grades: Record<string, number>;
  substitutions: Record<string, string>;
  maxSemester: number;
  selectedPrereqGroups: Record<string, string[]>; // courseId → chosen AND-group; absent = auto OR-logic
  summerSemesters: number[];
  currentSemester: number | null;
  semesterOrder: number[];  // display order of semesters 1..maxSemester
  semesterTypeOverrides?: Record<number, 'winter' | 'spring'>;  // manual winter/spring override per semester
  semesterWarningsIgnored?: number[];  // semester IDs where season warnings are suppressed
  doubleSpecializations?: string[];  // specialization group IDs selected as double (כפולה)
  hasEnglishExemption?: boolean;  // student has English language exemption
  manualSapAverages?: Record<string, number>;  // manual SAP average overrides per courseId
  binaryPass?: Record<string, boolean>;  // courseId → true = passed, not counted in weighted average
  explicitSportCompletions?: string[];  // sport course IDs completed explicitly by the user
  completedInstances?: string[];  // instance keys for repeatable courses: "courseId__semester__idx"
  savedTracks?: Record<string, StudentPlan>;  // per-track saved state for track switching
  miluimCredits?: number;  // 0–10: reserve duty credit reduction for כלל-טכניוני requirement
  englishScore?: number;   // 104–150: Amiram/Psychometric English score
  englishTaughtCourses?: string[];  // course IDs student marked as taught in English
  catalogYear: number | null;  // entry year selected at track selection (e.g. 2021 for 2021/22)
  dismissedRecommendedCourses?: Record<string, string[]>;
  facultyColorOverrides?: Record<string, string>;  // faculty name → color key override
  coreToChainOverrides?: string[];  // course IDs the student released from core → count toward specialization chain
  courseChainAssignments?: Record<string, string>;  // courseId → chainGroupId: explicit single-chain assignment
  electiveCreditAssignments?: Record<string, ElectiveCreditArea>;  // courseId -> manual elective credit bucket
  noAdditionalCreditOverrides?: Record<string, string>;  // pairKey -> courseId that should receive 0 recognized credits
  roboticsMinorEnabled?: boolean;  // student opted into the robotics minor
  entrepreneurshipMinorEnabled?: boolean;  // student opted into the entrepreneurial leadership minor
  quantumComputingMinorEnabled?: boolean;  // student opted into the quantum computing minor
  initializedTracks?: string[];  // trackIds that have been fully initialized at least once
  targetGraduationSemesterId?: number | null;  // semesterId from semesterOrder the student wants to graduate in
  loadProfile?: 'working' | 'fulltime';  // student's load preference for smart scheduling
  countOnlyCompletedCourses?: boolean;  // when true, only completed/graded courses count toward requirements
}

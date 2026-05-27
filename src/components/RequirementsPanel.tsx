import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { SapCourse } from '../types';
import { useShallow } from 'zustand/react/shallow';
import { usePlanStore } from '../store/planStore';
import type {
  GeneralElectivesBreakdown,
  GeneralRequirementProgress,
} from '../domain/generalRequirements/types';
import { isManualEnglishEligible } from '../data/generalRequirements/courseClassification';
import type { ElectiveCreditArea, SpecializationDiagnostic } from '../types';
import type {
  ElectiveAreaProgress,
  ElectiveAssignmentChoice,
  EnglishRequirementItem,
  CoreSlot,
} from '../hooks/usePlan';
import type { RoboticsMinorProgress } from '../hooks/useRoboticsMinor';
import { ELECTIVE_AREA_LABELS } from '../domain/electives';
import {
  ROBOTICS_MINOR_MIN_GPA,
  ROBOTICS_MINOR_MIN_TOTAL_CREDITS,
  ROBOTICS_LIST5_MIN_COURSES,
  ROBOTICS_LIST5_MIN_OUTSIDE_EE,
  ROBOTICS_MINOR_LISTS,
} from '../data/roboticsMinor';
import type { EntrepreneurshipMinorProgress } from '../hooks/useEntrepreneurshipMinor';
import type { QuantumComputingMinorProgress } from '../hooks/useQuantumComputingMinor';
import {
  ENTREPRENEURSHIP_COURSES,
  ENTREPRENEURSHIP_MINOR_MIN_GPA,
  ENTREPRENEURSHIP_MINOR_MIN_TOTAL_CREDITS,
  ENTREPRENEURSHIP_MINOR_MIN_CREDITS,
} from '../data/entrepreneurshipMinor';
import {
  QUANTUM_MINOR_ADVISOR_GPA,
  QUANTUM_MINOR_G2_OPTIONS,
  QUANTUM_MINOR_GROUPS,
  QUANTUM_MINOR_MIN_GPA,
  QUANTUM_MINOR_MIN_TOTAL_CREDITS,
} from '../data/quantumComputingMinor';

const SEM_LABELS = [
  "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'",
  "ח'", "ט'", "י'", 'י"א', 'י"ב', 'י"ג', 'י"ד', 'ט"ו', 'ט"ז',
];

const REQUIRED_ANY_OF_LABEL = '\u05dc\u05e4\u05d7\u05d5\u05ea \u05e7\u05d5\u05e8\u05e1 \u05d0\u05d7\u05d3 \u05de\u05d4\u05e8\u05e9\u05d9\u05de\u05d4';
const MANUAL_ASSIGNMENT_TITLE = '\u05e9\u05d9\u05d5\u05da \u05e7\u05d5\u05e8\u05e1\u05d9\u05dd \u05d3\u05d5-\u05de\u05e9\u05de\u05e2\u05d9\u05d9\u05dd';
const CREDIT_ASSIGNMENT_LABEL = '\u05e9\u05d9\u05d5\u05da \u05e0\u05e7"\u05d6';
function formatCredits(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

interface ProgressRowProps {
  label: string;
  earned: number;
  required: number;
  color: string;
}

function ProgressRow({ label, earned, required, color }: ProgressRowProps) {
  const pct = Math.min(100, required > 0 ? (earned / required) * 100 : 0);
  const done = earned >= required;

  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-gray-700">{label}</span>
        <span className={`text-sm font-bold ${done ? 'text-green-600' : 'text-gray-600'}`}>
          {earned.toFixed(1)} / {required} {done ? 'נק"ז' : ''}
        </span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface ElectiveBreakdownProps {
  areaRequirements: ElectiveAreaProgress[];
  assignmentChoices: ElectiveAssignmentChoice[];
  externalFaculty: {
    earned: number;
    limit: number;
    courseIds: string[];
  };
  courses: Map<string, SapCourse>;
  onSelectAssignment: (courseId: string, area: ElectiveCreditArea) => void;
}

function ElectiveBreakdown({
  areaRequirements,
  assignmentChoices,
  externalFaculty,
  courses,
  onSelectAssignment,
}: ElectiveBreakdownProps) {
  const [externalExpanded, setExternalExpanded] = useState(false);
  const showExternalFaculty = externalFaculty.limit > 0 && (externalFaculty.earned > 0 || externalFaculty.courseIds.length > 0);
  if (areaRequirements.length === 0 && assignmentChoices.length === 0 && !showExternalFaculty) {
    return null;
  }

  return (
    <div className="mb-3 rounded-lg border border-purple-100 bg-purple-50/60 px-3 py-2.5 space-y-2.5">
      {showExternalFaculty && (
        <div>
          <div className="flex justify-between items-center gap-3 mb-1">
            <button
              onClick={() => setExternalExpanded(e => !e)}
              className="flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-purple-700 transition-colors"
            >
              <span>{externalExpanded ? '▾' : '▸'}</span>
              <span>קורסים מוכרים מפקולטות אחרות</span>
            </button>
            <span className="text-xs font-semibold shrink-0 text-gray-600">
              {formatCredits(externalFaculty.earned)} / {formatCredits(externalFaculty.limit)}
            </span>
          </div>
          <div className="w-full bg-purple-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all bg-purple-500"
              style={{ width: `${Math.min(100, (externalFaculty.earned / externalFaculty.limit) * 100)}%` }}
            />
          </div>
          {externalExpanded && externalFaculty.courseIds.length > 0 && (
            <ul className="mt-2 space-y-1">
              {externalFaculty.courseIds.map(id => {
                const course = courses.get(id);
                return (
                  <li key={id} className="flex justify-between items-center gap-2 text-xs text-gray-600">
                    <span className="truncate">{course?.name ?? id}</span>
                    <span className="shrink-0 font-medium text-purple-700">
                      {formatCredits(course?.credits ?? 0)} נק"ז
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {areaRequirements.length > 0 && (
        <div className="space-y-2">
          {areaRequirements.map((requirement) => {
            const pct = Math.min(100, requirement.required > 0 ? (requirement.earned / requirement.required) * 100 : 0);
            const done = requirement.earned >= requirement.required;
            return (
              <div key={requirement.area}>
                <div className="flex justify-between items-center gap-3 mb-1">
                  <span className="text-xs font-medium text-gray-700">{requirement.label}</span>
                  <span className={`text-xs font-semibold shrink-0 ${done ? 'text-green-600' : 'text-gray-600'}`}>
                    {formatCredits(requirement.earned)} / {formatCredits(requirement.required)}
                  </span>
                </div>
                <div className="w-full bg-purple-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${done ? 'bg-green-500' : 'bg-purple-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {requirement.requiredAnyOfCourseIds && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-600">
                    <span className={`font-bold shrink-0 ${requirement.requiredAnyOfDone ? 'text-green-600' : 'text-gray-400'}`}>
                      {requirement.requiredAnyOfDone ? '\u2713' : '\u25cb'}
                    </span>
                    <span>
                      {REQUIRED_ANY_OF_LABEL}: {(requirement.requiredAnyOfCourseNames ?? requirement.requiredAnyOfCourseIds).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {assignmentChoices.length > 0 && (
        <div className="border-t border-purple-100 pt-2 space-y-1.5">
          <p className="text-xs font-medium text-gray-700">{MANUAL_ASSIGNMENT_TITLE}</p>
          {assignmentChoices.map((choice) => (
            <label key={choice.courseId} className="flex items-center justify-between gap-2 text-xs text-gray-600">
              <span className="min-w-0 truncate">{choice.courseName}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-400">{CREDIT_ASSIGNMENT_LABEL}</span>
                <select
                  value={choice.selectedArea}
                  onChange={(event) => onSelectAssignment(choice.courseId, event.target.value as ElectiveCreditArea)}
                  className="text-xs border border-purple-200 rounded bg-white px-1.5 py-0.5 text-gray-700"
                >
                  {choice.options.map((area) => (
                    <option key={area} value={area}>{ELECTIVE_AREA_LABELS[area]}</option>
                  ))}
                </select>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface CompactRequirementRowProps {
  req: GeneralRequirementProgress;
  targetValue?: number;
  missingValue?: number;
  manualEnglishCourseIds: string[];
  englishTaughtCourses: string[];
  onToggleEnglishCourse: (courseId: string) => void;
  englishScore?: number;
  onSetEnglishScore?: (score: number | null) => void;
  englishRequirementItems?: EnglishRequirementItem[];
}

function getRequirementDisplayLabel(req: GeneralRequirementProgress): string {
  switch (req.requirementId) {
    case 'general_electives':
      return 'קורסי בחירה כלל טכניוניים';
    case 'english':
      return 'קורסים באנגלית';
    case 'labs':
      return 'מעבדות';
    default:
      return req.title;
  }
}

function formatRequirementValue(req: GeneralRequirementProgress, targetValue: number): string {
  const unit = req.targetUnit === 'credits' ? 'נק"ז' : 'קורסים';
  const completed = req.completedValue % 1 === 0 ? req.completedValue : req.completedValue.toFixed(1);
  return `${completed} / ${targetValue} ${unit}`;
}

interface SubBarProps {
  label: string;
  recognized: number;
  target: number;
}

function SubBar({ label, recognized, target }: SubBarProps) {
  const pct = target > 0 ? Math.min(100, (recognized / target) * 100) : recognized > 0 ? 100 : 0;
  const done = target > 0 && recognized >= target;
  const muted = target === 0;
  return (
    <div>
      <div className="flex justify-between items-center gap-3 mb-0.5">
        <span className={`text-sm ${muted ? 'text-gray-400' : 'text-gray-700'}`}>{label}</span>
        <span className={`text-sm font-semibold shrink-0 ${done ? 'text-green-600' : muted ? 'text-gray-400' : 'text-gray-600'}`}>
          {formatCredits(recognized)} / {formatCredits(target)}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1">
        <div
          className={`h-1 rounded-full transition-all ${done ? 'bg-green-500' : 'bg-gray-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface GeneralElectivesRowProps {
  req: GeneralRequirementProgress;
  breakdown: GeneralElectivesBreakdown;
  manualEnglishCourseIds: string[];
  englishTaughtCourses: string[];
  onToggleEnglishCourse: (courseId: string) => void;
}

function GeneralElectivesRow({
  req,
  breakdown,
  manualEnglishCourseIds,
  englishTaughtCourses,
  onToggleEnglishCourse,
}: GeneralElectivesRowProps) {
  const [showDetails, setShowDetails] = useState(false);
  const total = breakdown.total;
  const pct = total.target > 0 ? Math.min(100, (total.recognized / total.target) * 100) : 0;
  const isDone = total.target > 0 && total.recognized >= total.target;
  const missing = Math.max(0, total.target - total.recognized);
  const missingText = missing > 0
    ? `${formatCredits(missing)} נק"ז חסרים`
    : 'הושלם';

  const c = breakdown.contributors;
  const hasAnyDetail =
    c.regularSportToFloor > 0 ||
    c.regularSportToFreeChoice > 0 ||
    c.melagToFloor > 0 ||
    c.melagToFreeChoice > 0 ||
    c.externalFacultyToFreeChoice > 0 ||
    c.choirRecognized > 0 ||
    c.sportsTeamRecognized > 0 ||
    c.choirToEnrichmentFloor > 0 ||
    c.choirToFreeChoice > 0 ||
    c.sportsTeamToSportFloor > 0 ||
    c.sportsTeamToEnrichmentFloor > 0 ||
    c.sportsTeamToFreeChoice > 0 ||
    c.unrecognizedSpecialCredits > 0 ||
    c.surplusBeyond12 > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{getRequirementDisplayLabel(req)}</span>
            {isDone && <span className="text-xs font-semibold text-green-600">הושלם</span>}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{missingText}</p>
        </div>
        <span className={`text-xs font-semibold shrink-0 ${isDone ? 'text-green-600' : 'text-gray-600'}`}>
          {formatCredits(total.recognized)} / {formatCredits(total.target)} נק"ז
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
        <div
          className={`h-1.5 rounded-full transition-all ${isDone ? 'bg-green-500' : 'bg-gray-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2.5 ms-2 space-y-1.5 border-s-2 border-gray-200 ps-2.5">
        <SubBar label='ספורט (חובה)' recognized={breakdown.sportFloor.recognized} target={breakdown.sportFloor.target} />
        <SubBar label='מקצועות העשרה / מל"ג' recognized={breakdown.enrichmentFloor.recognized} target={breakdown.enrichmentFloor.target} />
        <SubBar label='בחירה חופשית' recognized={breakdown.freeChoice.recognized} target={breakdown.freeChoice.target} />
      </div>

      {hasAnyDetail && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {showDetails ? '▲ הסתר פירוט' : '▼ פירוט מקורות'}
          </button>
          {showDetails && (
            <div className="mt-1.5 space-y-1 text-xs text-gray-600">
              {c.regularSportToFloor > 0 && (
                <p>ספורט רגיל ← רצפת ספורט: {formatCredits(c.regularSportToFloor)} נק"ז</p>
              )}
              {c.regularSportToFreeChoice > 0 && (
                <p>ספורט רגיל (עודף) ← בחירה חופשית: {formatCredits(c.regularSportToFreeChoice)} נק"ז</p>
              )}
              {c.melagToFloor > 0 && (
                <p>מל"ג ← רצפת העשרה: {formatCredits(c.melagToFloor)} נק"ז</p>
              )}
              {c.melagToFreeChoice > 0 && (
                <p>מל"ג (עודף) ← בחירה חופשית: {formatCredits(c.melagToFreeChoice)} נק"ז</p>
              )}
              {c.externalFacultyToFreeChoice > 0 && (
                <p>קורסי בחירה מפקולטות אחרות ← בחירה חופשית: {formatCredits(c.externalFacultyToFreeChoice)} נק"ז</p>
              )}
              {c.choirRecognized > 0 && (
                <p>מקהלה / תזמורת — הוכרו לפי הטבלה: {formatCredits(c.choirRecognized)} נק"ז</p>
              )}
              {c.choirToEnrichmentFloor > 0 && (
                <p>מקהלה / תזמורת ← רצפת העשרה: {formatCredits(c.choirToEnrichmentFloor)} נק"ז</p>
              )}
              {c.choirToFreeChoice > 0 && (
                <p>מקהלה / תזמורת ← בחירה חופשית: {formatCredits(c.choirToFreeChoice)} נק"ז</p>
              )}
              {c.sportsTeamRecognized > 0 && (
                <p>נבחרת ספורט — הוכרו לפי הטבלה: {formatCredits(c.sportsTeamRecognized)} נק"ז</p>
              )}
              {c.sportsTeamToSportFloor > 0 && (
                <p>נבחרת ספורט ← רצפת ספורט: {formatCredits(c.sportsTeamToSportFloor)} נק"ז</p>
              )}
              {c.sportsTeamToEnrichmentFloor > 0 && (
                <p>נבחרת ספורט ← רצפת העשרה: {formatCredits(c.sportsTeamToEnrichmentFloor)} נק"ז</p>
              )}
              {c.sportsTeamToFreeChoice > 0 && (
                <p>נבחרת ספורט ← בחירה חופשית: {formatCredits(c.sportsTeamToFreeChoice)} נק"ז</p>
              )}
              {c.unrecognizedSpecialCredits > 0 && (
                <p className="text-amber-700">
                  לא הוכרו (מעבר לתקרת מקהלה/תזמורת/נבחרת): {formatCredits(c.unrecognizedSpecialCredits)} נק"ז
                </p>
              )}
              {c.surplusBeyond12 > 0 && (
                <p className="text-amber-700">
                  עודף מעבר ל-{formatCredits(total.target)} נק"ז שלא נספר: {formatCredits(c.surplusBeyond12)} נק"ז
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {req.countedCourses.length > 0 && (() => {
        const grouped = new Map<string, { name: string; count: number }>();
        for (const course of req.countedCourses) {
          const entry = grouped.get(course.courseId);
          if (entry) entry.count++;
          else grouped.set(course.courseId, { name: course.name, count: 1 });
        }
        return (
          <div className="mt-2 flex flex-wrap gap-1">
            {Array.from(grouped.values()).map(({ name, count }) => (
              <span key={`general-electives-${name}`} className="text-xs rounded-full bg-white border border-gray-200 px-2 py-0.5 text-gray-600">
                {count > 1 ? `${name} ×${count}` : name}
              </span>
            ))}
          </div>
        );
      })()}

      {manualEnglishCourseIds.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {manualEnglishCourseIds.map((courseId) => {
            const course = req.countedCourses.find((item) => item.courseId === courseId);
            if (!course) return null;
            return (
              <label key={`general-electives-toggle-${courseId}`} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={englishTaughtCourses.includes(courseId)}
                  onChange={() => onToggleEnglishCourse(courseId)}
                  className="rounded"
                />
                <span>{course.name} נלמד באנגלית</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function renderEnglishRequirementText(requirement: EnglishRequirementItem): string {
  if (requirement.kind === 'content_course') {
    if (requirement.courseNames.length === 0) {
      return requirement.neededCount === 2 ? 'חסרים 2 קורסי תוכן באנגלית' : 'חסר קורס תוכן באנגלית';
    }

    if (requirement.neededCount === 2) {
      return requirement.courseNames.length === 2
        ? requirement.courseNames.join(', ')
        : `${requirement.courseNames[0]} + חסר קורס נוסף`;
    }

    return requirement.courseNames[0];
  }

  return requirement.courseNames[0] ?? requirement.label;
}

function CompactRequirementRow({
  req,
  targetValue = req.targetValue,
  missingValue = req.missingValue,
  manualEnglishCourseIds,
  englishTaughtCourses,
  onToggleEnglishCourse,
  englishScore,
  onSetEnglishScore,
  englishRequirementItems,
}: CompactRequirementRowProps) {
  const pct = Math.min(100, targetValue > 0 ? (req.completedValue / targetValue) * 100 : 0);
  const isDone = req.completedValue >= targetValue;
  const missingText = missingValue > 0
    ? `${missingValue % 1 === 0 ? missingValue : missingValue.toFixed(1)} ${req.targetUnit === 'credits' ? 'נק"ז' : 'קורסים'} חסרים`
    : 'הושלם';

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{getRequirementDisplayLabel(req)}</span>
            {isDone && <span className="text-xs font-semibold text-green-600">הושלם</span>}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{missingText}</p>
        </div>
        <span className={`text-xs font-semibold shrink-0 ${isDone ? 'text-green-600' : 'text-gray-600'}`}>
          {formatRequirementValue(req, targetValue)}
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
        <div
          className={`h-1.5 rounded-full transition-all ${isDone ? 'bg-green-500' : 'bg-gray-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {req.requirementId === 'english' && onSetEnglishScore && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">ניקוד אמיר"ם:</span>
          <input
            type="number"
            min={104}
            max={150}
            value={englishScore ?? ''}
            onChange={(event) => {
              const nextValue = event.target.value === '' ? null : parseInt(event.target.value, 10);
              onSetEnglishScore(nextValue);
            }}
            placeholder="104-150"
            className="w-24 text-xs border border-gray-300 rounded px-1.5 py-0.5 text-center bg-white"
          />
        </div>
      )}

      {req.requirementId === 'english' && (
        <div className="mt-2 space-y-1.5">
          {englishScore === undefined ? (
            <p className="text-xs text-gray-400">הזן ניקוד אמיר"ם כדי לחשב את דרישות האנגלית</p>
          ) : (
            englishRequirementItems?.map((requirement) => (
              <div key={`${req.requirementId}-${requirement.kind}-${requirement.label}`} className="flex items-start gap-2 text-xs">
                <span className={`font-bold mt-0.5 ${requirement.done ? 'text-green-600' : 'text-gray-400'}`}>
                  {requirement.done ? '✓' : '○'}
                </span>
                <div className="min-w-0">
                  <div className={`font-medium ${requirement.done ? 'text-green-700' : 'text-gray-600'}`}>{requirement.label}</div>
                  <div className="text-gray-500 break-words">{renderEnglishRequirementText(requirement)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {req.countedCourses.length > 0 && req.requirementId !== 'english' && (() => {
        const grouped = new Map<string, { name: string; count: number }>();
        for (const course of req.countedCourses) {
          const entry = grouped.get(course.courseId);
          if (entry) { entry.count++; }
          else { grouped.set(course.courseId, { name: course.name, count: 1 }); }
        }
        return (
          <div className="mt-2 flex flex-wrap gap-1">
            {Array.from(grouped.values()).map(({ name, count }) => (
              <span key={`${req.requirementId}-${name}`} className="text-sm rounded-full bg-white border border-gray-200 px-2 py-0.5 text-gray-600">
                {count > 1 ? `${name} ×${count}` : name}
              </span>
            ))}
          </div>
        );
      })()}

      {manualEnglishCourseIds.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {manualEnglishCourseIds.map((courseId) => {
            const course = req.countedCourses.find((item) => item.courseId === courseId);
            if (!course) return null;

            return (
              <label key={`${req.requirementId}-toggle-${courseId}`} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={englishTaughtCourses.includes(courseId)}
                  onChange={() => onToggleEnglishCourse(courseId)}
                  className="rounded"
                />
                <span>{course.name} נלמד באנגלית</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface Props {
  courses: Map<string, SapCourse>;
  progress: {
    mandatory: { earned: number; required: number };
    elective: { earned: number; required: number };
    electiveBreakdown: {
      areaRequirements: ElectiveAreaProgress[];
      assignmentChoices: ElectiveAssignmentChoice[];
      generalCourseIds: string[];
      generalCreditsByCourseId?: Record<string, number>;
      externalFaculty: {
        earned: number;
        limit: number;
        courseIds: string[];
      };
    };
    total: { earned: number; required: number };
    completedCredits: number;
    specializationGroups: {
      completed: number;
      required: number;
      total: number;
      unavailable?: boolean;
      diagnostics?: SpecializationDiagnostic[];
    };
    groupDetails: {
      id: string;
      name: string;
      done: number;
      min: number;
      isDouble?: boolean;
      complete?: boolean;
      issues?: string[];
      summaries?: { id: string; label: string; done: number; required: number }[];
    }[];
    general: { earned: number; required: number };
    generalRequirements: GeneralRequirementProgress[];
    generalElectivesBreakdown: GeneralElectivesBreakdown;
    labPoolProgress: { earned: number; required: number; mandatory: boolean; max?: number } | null;
    coreRequirementProgress: {
      completed: number;
      required: number;
      total: number;
      slots: CoreSlot[];
      canRelease: string[];
    } | null;
    english: {
      placed: { id: string; name: string }[];
      hasExemption: boolean;
      score?: number;
      requirements: EnglishRequirementItem[];
      taughtCourses: string[];
      englishInPlan: string[];
    };
    roboticsMinorProgress: RoboticsMinorProgress | null;
    entrepreneurshipMinorProgress: EntrepreneurshipMinorProgress | null;
    quantumComputingMinorProgress: QuantumComputingMinorProgress | null;
    isReady: boolean;
  } | null;
  weightedAverage: number | null;
}

export const RequirementsPanel = memo(function RequirementsPanel({ progress, weightedAverage, courses }: Props) {
  const {
    trackId,
    setMiluimCredits,
    setEnglishScore,
    toggleEnglishTaughtCourse,
    setCoreToChainOverrides,
    toggleRoboticsMinor,
    toggleEntrepreneurshipMinor,
    toggleQuantumComputingMinor,
    addCourseToSemester,
    setElectiveCreditAssignment,
    miluimCredits,
    englishTaughtCourses,
    coreToChainOverrides,
    roboticsMinorEnabled,
    entrepreneurshipMinorEnabled,
    quantumComputingMinorEnabled,
    semesterOrder,
    summerSemesters,
    semesters,
    completedCourses,
    countOnlyCompletedCourses,
    toggleCountOnlyCompleted,
  } = usePlanStore(useShallow((state) => ({
    trackId: state.trackId,
    setMiluimCredits: state.setMiluimCredits,
    setEnglishScore: state.setEnglishScore,
    toggleEnglishTaughtCourse: state.toggleEnglishTaughtCourse,
    setCoreToChainOverrides: state.setCoreToChainOverrides,
    toggleRoboticsMinor: state.toggleRoboticsMinor,
    toggleEntrepreneurshipMinor: state.toggleEntrepreneurshipMinor,
    toggleQuantumComputingMinor: state.toggleQuantumComputingMinor,
    addCourseToSemester: state.addCourseToSemester,
    setElectiveCreditAssignment: state.setElectiveCreditAssignment,
    miluimCredits: state.miluimCredits,
    englishTaughtCourses: state.englishTaughtCourses ?? [],
    coreToChainOverrides: state.coreToChainOverrides ?? [],
    roboticsMinorEnabled: state.roboticsMinorEnabled ?? false,
    entrepreneurshipMinorEnabled: state.entrepreneurshipMinorEnabled ?? false,
    quantumComputingMinorEnabled: state.quantumComputingMinorEnabled ?? false,
    semesterOrder: state.semesterOrder,
    summerSemesters: state.summerSemesters,
    semesters: state.semesters,
    completedCourses: state.completedCourses,
    countOnlyCompletedCourses: state.countOnlyCompletedCourses ?? false,
    toggleCountOnlyCompleted: state.toggleCountOnlyCompleted,
  })));
  const [expandedRoboticsList, setExpandedRoboticsList] = useState<number | null>(null);
  const [expandedQuantumGroup, setExpandedQuantumGroup] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerFor(null);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const regularIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    let count = 0;
    for (const s of semesterOrder) {
      if (!summerSemesters.includes(s)) {
        count++;
        map.set(s, count);
      }
    }
    return map;
  }, [semesterOrder, summerSemesters]);

  const semesterOptions = useMemo(() => [
    { label: 'ללא שיבוץ', value: 0 },
    ...semesterOrder.map((sem) => ({
      label: summerSemesters.includes(sem)
        ? 'סמסטר קיץ'
        : `סמסטר ${SEM_LABELS[(regularIndexMap.get(sem) ?? sem) - 1] ?? sem}`,
      value: sem,
    })),
  ], [semesterOrder, summerSemesters, regularIndexMap]);

  const allPlaced = useMemo(() => new Set([
    ...completedCourses,
    ...Object.values(semesters).flat(),
  ]), [completedCourses, semesters]);

  const compactRequirements = useMemo(() => (
    (progress?.generalRequirements ?? []).filter((req) => (
      req.requirementId === 'general_electives' ||
      req.requirementId === 'english' ||
      req.requirementId === 'labs'
    ))
  ), [progress?.generalRequirements]);

  const generalElectivesManualEnglishCourseIds = useMemo(() => {
    const generalElectives = compactRequirements.find((req) => req.requirementId === 'general_electives');
    if (!generalElectives) return [];
    return generalElectives.countedCourses
      .filter((course) => isManualEnglishEligible(course.courseId))
      .map((course) => course.courseId);
  }, [compactRequirements]);

  if (!progress) return null;

  function renderMinorAddButton(courseId: string) {
    const isPickerOpen = pickerFor === courseId;
    return (
      <div className="relative shrink-0" ref={isPickerOpen ? pickerRef : undefined}>
        <button
          onClick={(event) => {
            event.stopPropagation();
            setPickerFor(isPickerOpen ? null : courseId);
          }}
          className={`text-xs border px-1 py-0.5 rounded transition-colors ${
            isPickerOpen
              ? 'bg-blue-500 text-white border-blue-500'
              : 'text-blue-500 hover:text-blue-700 border-blue-200 hover:border-blue-400'
          }`}
          title="הוסף לסמסטר"
        >
          +
        </button>
        {isPickerOpen && (
          <div className="absolute start-0 top-full mt-0.5 z-[60] bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[130px]">
            {semesterOptions.map(({ label, value }) => (
              <button
                key={value}
                onClick={(event) => {
                  event.stopPropagation();
                  addCourseToSemester(courseId, value);
                  setPickerFor(null);
                }}
                className="w-full text-right text-xs px-2.5 py-1 hover:bg-blue-50 text-gray-700 hover:text-blue-700 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const isMiluim = miluimCredits !== undefined;
  const shouldShowCoreAddButton = trackId === 'ce' || trackId === 'cs';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sidebar-panel">
      <h2 className="text-base font-bold text-slate-800 mb-3 tracking-tight">מעקב דרישות</h2>

      <div className="mb-4 flex rounded-xl border border-slate-200 overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => countOnlyCompletedCourses && toggleCountOnlyCompleted()}
          className={`flex-1 py-1.5 px-2 transition-colors ${
            !countOnlyCompletedCourses
              ? 'font-semibold text-white'
              : 'bg-white text-slate-500 hover:bg-slate-50'
          }`}
          style={!countOnlyCompletedCourses ? { background: '#1e4d93' } : {}}
        >
          כל הקורסים
        </button>
        <button
          type="button"
          onClick={() => !countOnlyCompletedCourses && toggleCountOnlyCompleted()}
          className={`flex-1 py-1.5 px-2 transition-colors border-r border-slate-200 ${
            countOnlyCompletedCourses
              ? 'font-semibold text-white'
              : 'bg-white text-slate-500 hover:bg-slate-50'
          }`}
          style={countOnlyCompletedCourses ? { background: '#1e4d93' } : {}}
        >
          הושלמו בלבד ✓
        </button>
      </div>

      {progress.isReady && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-center">
          <p className="text-emerald-700 font-semibold text-sm">עמדת בכל הדרישות!</p>
        </div>
      )}

      <ProgressRow label='נק"ז שהושלמו ✓' earned={progress.completedCredits} required={progress.total.required} color="progress-green" />
      <ProgressRow label={'סה"כ נקודות'} earned={progress.total.earned} required={progress.total.required} color="progress-gray" />
      <ProgressRow label="קורסי חובה" earned={progress.mandatory.earned} required={progress.mandatory.required} color="progress-blue" />
      <ProgressRow label="קורסי בחירה פקולטית" earned={progress.elective.earned} required={progress.elective.required} color="progress-purple" />
      <ElectiveBreakdown
        areaRequirements={progress.electiveBreakdown.areaRequirements}
        assignmentChoices={progress.electiveBreakdown.assignmentChoices}
        externalFaculty={progress.electiveBreakdown.externalFaculty}
        courses={courses}
        onSelectAssignment={setElectiveCreditAssignment}
      />
      {progress.coreRequirementProgress && (() => {
        const { completed, required, slots, canRelease } = progress.coreRequirementProgress!;
        const done = completed >= required;
        const pct = Math.min(100, required > 0 ? (completed / required) * 100 : 0);
        return (
          <div className="mb-3 rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2.5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-800">קורסי ליבה</span>
              <span className={`text-sm font-bold ${done ? 'text-green-600' : 'text-gray-600'}`}>
                {completed} / {required} {done ? 'קורסים ✓' : 'קורסים'}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
              <div className={`h-2 rounded-full transition-all ${done ? 'progress-green' : 'progress-orange'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="space-y-1">
              {slots.map((slot) => (
                <div key={slot.ids.join('|')} className="flex items-start gap-1.5 text-xs">
                  <span className={`font-bold mt-0.5 shrink-0 ${slot.done ? 'text-green-600' : slot.released ? 'text-purple-500' : 'text-gray-400'}`}>
                    {slot.done ? '✓' : slot.released ? '↗' : '○'}
                  </span>
                  <div className="min-w-0 flex-1">
                    {shouldShowCoreAddButton ? (
                      <div className="space-y-1">
                        {slot.ids.map((id, index) => {
                          const canAdd = slot.availableIds.includes(id);
                          const rowTextColor = slot.done
                            ? 'text-green-700'
                            : slot.released
                              ? 'text-purple-600'
                              : canAdd
                                ? 'text-gray-500'
                                : 'text-gray-600';

                          return (
                            <div key={id} className="flex items-center gap-1.5">
                              <span className={rowTextColor}>
                                {slot.names[index]}
                                {slot.ids.length > 1 && index === slot.ids.length - 1 && ' (אחד מהשניים)'}
                              </span>
                              {canAdd && renderMinorAddButton(id)}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className={slot.done ? 'text-green-700' : slot.released ? 'text-purple-600' : 'text-gray-500'}>
                        {slot.ids.length > 1
                          ? `${slot.names.join(' / ')} (אחד מהשניים)`
                          : slot.names[0]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {canRelease.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-1.5">שחרור עודף לשרשרת:</p>
                <div className="space-y-1">
                  {canRelease.map((id) => {
                    const isReleased = coreToChainOverrides.includes(id);
                    const slot = slots.find((s) => s.ids.includes(id));
                    const name = slot?.names[slot.ids.indexOf(id)] ?? id;
                    return (
                      <label key={id} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isReleased}
                          onChange={() => {
                            if (isReleased) {
                              setCoreToChainOverrides(coreToChainOverrides.filter((x) => x !== id));
                            } else {
                              setCoreToChainOverrides([...coreToChainOverrides, id]);
                            }
                          }}
                          className="rounded"
                        />
                        <span>{name} → לשרשרת</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <div className="mb-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isMiluim}
            onChange={(event) => {
              if (event.target.checked) {
                setMiluimCredits(0);
              } else {
                setMiluimCredits(null);
              }
            }}
            className="rounded"
          />
          מילואים
        </label>
        {isMiluim && (
          <div className="flex items-center gap-1">
            <input
              key={miluimCredits ?? 'empty'}
              type="number"
              min={0}
              max={10}
              defaultValue={miluimCredits ?? ''}
              onChange={(event) => {
                const parsed = parseInt(event.target.value, 10);
                if (!Number.isNaN(parsed)) setMiluimCredits(parsed);
              }}
              className="w-14 text-xs border border-gray-300 rounded px-1.5 py-0.5 text-center"
              placeholder="0-10"
            />
            <span className="text-xs text-gray-400">נק"ז</span>
          </div>
        )}
      </div>

      <div className="mb-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={roboticsMinorEnabled}
            onChange={toggleRoboticsMinor}
            className="rounded"
          />
          התמחות משנה ברובוטיקה
        </label>
      </div>

      {roboticsMinorEnabled && progress.roboticsMinorProgress && (() => {
        const rp = progress.roboticsMinorProgress;
        return (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
            <div className="text-xs text-amber-800 space-y-0.5">
              <p className="font-semibold">דרישות קבלה להתמחות המשנה</p>
              <p className={rp.missingTotalCredits ? 'text-red-600' : 'text-green-700'}>
                {rp.missingTotalCredits
                  ? `נדרשות לפחות ${ROBOTICS_MINOR_MIN_TOTAL_CREDITS} נק"ז — חסר`
                  : `לפחות ${ROBOTICS_MINOR_MIN_TOTAL_CREDITS} נק"ז ✓`}
              </p>
              <p className={rp.missingGpa ? 'text-red-600' : 'text-green-700'}>
                {rp.missingGpa
                  ? `נדרש ממוצע ≥ ${ROBOTICS_MINOR_MIN_GPA} — חסר`
                  : `ממוצע ≥ ${ROBOTICS_MINOR_MIN_GPA} ✓`}
              </p>
              <p className="text-amber-700">נדרש גם עמידה בתהליך מיון</p>
            </div>

            <ProgressRow
              label='נק"ז מרשימות הרובוטיקה'
              earned={rp.poolEarned}
              required={rp.poolRequired}
              color={rp.poolSatisfied ? 'bg-green-500' : 'bg-amber-400'}
            />

            <div className="space-y-1">
              {rp.listProgress.map((lp) => {
                const isExpanded = expandedRoboticsList === lp.listNumber;
                const listData = ROBOTICS_MINOR_LISTS.find((l) => l.listNumber === lp.listNumber)!;
                return (
                  <div key={lp.listNumber}>
                    <button
                      onClick={() => setExpandedRoboticsList(isExpanded ? null : lp.listNumber)}
                      className={`text-xs px-1.5 py-0.5 rounded-full w-full text-right flex justify-between items-center ${
                        lp.satisfied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <span>{isExpanded ? '▲' : '▼'}</span>
                      <span>{lp.title}{lp.satisfied ? ' ✓' : ` ${lp.satisfiedCount}/${lp.minCourses}`}</span>
                    </button>
                    {isExpanded && (
                      <div className="mt-0.5 ms-2 space-y-0.5">
                        {listData.courses.map((course) => {
                          const placed = allPlaced.has(course.id);
                          return (
                            <div key={course.id} className="flex items-center gap-1 text-xs">
                              <span className={placed ? 'text-green-600 font-bold' : 'text-gray-400'}>
                                {placed ? '✓' : '○'}
                              </span>
                              <span className={`${placed ? 'text-green-700' : 'text-gray-500'} flex-1 min-w-0`}>
                                {course.name}
                              </span>
                              <span className="text-gray-300 shrink-0">{course.credits} נק"ז</span>
                              {!placed && renderMinorAddButton(course.id)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {(() => {
              const list5 = rp.listProgress.find((l) => l.listNumber === 5)!;
              return (
                <div className={`text-xs ${rp.list5Satisfied ? 'text-green-700' : 'text-gray-600'}`}>
                  {`${list5.title}: ${rp.list5TotalCourses}/${ROBOTICS_LIST5_MIN_COURSES} קורסים`}
                  {rp.list5OutsideEECourses < ROBOTICS_LIST5_MIN_OUTSIDE_EE
                    ? ` (${rp.list5OutsideEECourses}/${ROBOTICS_LIST5_MIN_OUTSIDE_EE} מחוץ לפקולטה)`
                    : ` — ${rp.list5OutsideEECourses}/${ROBOTICS_LIST5_MIN_OUTSIDE_EE} מחוץ לפקולטה ✓`}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {trackId === 'ce' && (
        <div className="mb-2 flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={quantumComputingMinorEnabled}
              onChange={toggleQuantumComputingMinor}
              className="rounded"
            />
            התמחות משנית בחישוב קוונטי
          </label>
        </div>
      )}

      {trackId === 'ce' && quantumComputingMinorEnabled && progress.quantumComputingMinorProgress && (() => {
        const qp = progress.quantumComputingMinorProgress;
        const gpaClass = qp.gpaStatus === 'eligible'
          ? 'text-green-700'
          : qp.gpaStatus === 'advisor'
            ? 'text-amber-700'
            : 'text-red-600';
        const gpaText = qp.gpaStatus === 'eligible'
          ? `ממוצע ≥ ${QUANTUM_MINOR_MIN_GPA} ✓`
          : qp.gpaStatus === 'advisor'
            ? `ממוצע ${QUANTUM_MINOR_ADVISOR_GPA}-${QUANTUM_MINOR_MIN_GPA}: נדרש אישור יועץ`
            : `נדרש ממוצע ≥ ${QUANTUM_MINOR_MIN_GPA} או אישור יועץ מ-${QUANTUM_MINOR_ADVISOR_GPA}`;

        return (
          <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 space-y-2">
            <div className="text-xs text-sky-800 space-y-0.5">
              <p className="font-semibold">דרישות קבלה להתמחות המשנית</p>
              <p className={qp.missingTotalCredits ? 'text-red-600' : 'text-green-700'}>
                {qp.missingTotalCredits
                  ? `נדרשות לפחות ${QUANTUM_MINOR_MIN_TOTAL_CREDITS} נק"ז — חסר`
                  : `לפחות ${QUANTUM_MINOR_MIN_TOTAL_CREDITS} נק"ז ✓`}
              </p>
              <p className={gpaClass}>{gpaText}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`rounded-md px-2 py-1 ${qp.option1Satisfied ? 'bg-green-100 text-green-700' : 'bg-white text-gray-600'}`}>
                אפשרות 1 {qp.option1Satisfied ? '✓' : ''}
              </div>
              <div className={`rounded-md px-2 py-1 ${qp.option2Satisfied ? 'bg-green-100 text-green-700' : 'bg-white text-gray-600'}`}>
                אפשרות 2 {qp.option2Satisfied ? '✓' : ''}
              </div>
            </div>

            <div className="space-y-1">
              {qp.groupProgress.map((gp) => {
                const isExpanded = expandedQuantumGroup === gp.id;
                const groupData = QUANTUM_MINOR_GROUPS.find((group) => group.id === gp.id)!;
                return (
                  <div key={gp.id}>
                    <button
                      onClick={() => setExpandedQuantumGroup(isExpanded ? null : gp.id)}
                      className={`text-xs px-1.5 py-0.5 rounded-full w-full text-right flex justify-between items-center ${
                        gp.satisfied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <span>{isExpanded ? '▲' : '▼'}</span>
                      <span>{gp.title}{gp.satisfied ? ' ✓' : ` ${gp.satisfiedCount}/${gp.minCourses}`}</span>
                    </button>
                    {isExpanded && (
                      <div className="mt-0.5 ms-2 space-y-0.5">
                        {groupData.courses.map((course) => {
                          const placed = allPlaced.has(course.id);
                          return (
                            <div key={course.id} className="flex items-center gap-1 text-xs">
                              <span className={placed ? 'text-green-600 font-bold' : 'text-gray-400'}>
                                {placed ? '✓' : '○'}
                              </span>
                              <span className={`${placed ? 'text-green-700' : 'text-gray-500'} flex-1 min-w-0`}>
                                {course.name}
                              </span>
                              <span className="text-gray-300 shrink-0">{course.credits} נק"ז</span>
                              {!placed && renderMinorAddButton(course.id)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-700">ג2. קורסי טרום-קוונטים</p>
              {qp.g2OptionProgress.map((option) => {
                const optionData = QUANTUM_MINOR_G2_OPTIONS.find((entry) => entry.id === option.id)!;
                return (
                  <div key={option.id} className={`rounded-md px-2 py-1 ${option.satisfied ? 'bg-green-100' : 'bg-white'}`}>
                    <div className={`text-xs font-medium ${option.satisfied ? 'text-green-700' : 'text-gray-600'}`}>
                      {option.title}{option.satisfied ? ' ✓' : ` ${option.matchedCourseIds.length}/${option.requiredCourseIds.length}`}
                    </div>
                    <div className="mt-0.5 space-y-0.5">
                      {optionData.courses.map((course) => {
                        const placed = allPlaced.has(course.id);
                        return (
                          <div key={course.id} className="flex items-center gap-1 text-xs">
                            <span className={placed ? 'text-green-600 font-bold' : 'text-gray-400'}>
                              {placed ? '✓' : '○'}
                            </span>
                            <span className={`${placed ? 'text-green-700' : 'text-gray-500'} flex-1 min-w-0`}>
                              {course.name}
                            </span>
                            {!placed && renderMinorAddButton(course.id)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="mb-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={entrepreneurshipMinorEnabled}
            onChange={toggleEntrepreneurshipMinor}
            className="rounded"
          />
          התמחות משנית במנהיגות יזמית
        </label>
      </div>

      {entrepreneurshipMinorEnabled && progress.entrepreneurshipMinorProgress && (() => {
        const ep = progress.entrepreneurshipMinorProgress;
        const mandatoryCourses = ENTREPRENEURSHIP_COURSES.filter((c) => c.mandatory);
        return (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
            <div className="text-xs text-amber-800 space-y-0.5">
              <p className="font-semibold">דרישות קבלה להתמחות המשנית</p>
              <p className={ep.missingTotalCredits ? 'text-red-600' : 'text-green-700'}>
                {ep.missingTotalCredits
                  ? `נדרשות לפחות ${ENTREPRENEURSHIP_MINOR_MIN_TOTAL_CREDITS} נק"ז — חסר`
                  : `לפחות ${ENTREPRENEURSHIP_MINOR_MIN_TOTAL_CREDITS} נק"ז ✓`}
              </p>
              <p className={ep.missingGpa ? 'text-red-600' : 'text-green-700'}>
                {ep.missingGpa
                  ? `נדרש ממוצע > ${ENTREPRENEURSHIP_MINOR_MIN_GPA} — חסר`
                  : `ממוצע > ${ENTREPRENEURSHIP_MINOR_MIN_GPA} ✓`}
              </p>
              <p className="text-amber-700">יש להגיש בקשת סטודנט במזכירות הסמכה בפקולטה</p>
            </div>

            <ProgressRow
              label={`נק"ז מקורסי ההתמחות (מינ' ${ENTREPRENEURSHIP_MINOR_MIN_CREDITS})`}
              earned={ep.creditsEarned}
              required={ep.creditsRequired}
              color={ep.creditsSatisfied ? 'bg-green-500' : 'bg-amber-400'}
            />

            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-700">
                קורסי חובה: {ep.mandatoryCompleted}/{ep.mandatoryRequired}
              </p>
              {mandatoryCourses.map((course) => {
                const placed = course.id !== null && allPlaced.has(course.id);
                return (
                  <div key={course.name} className="flex items-center gap-1.5 text-xs">
                    <span className={`font-bold shrink-0 ${placed ? 'text-green-600' : 'text-gray-400'}`}>
                      {placed ? '✓' : '○'}
                    </span>
                    <span className={`${placed ? 'text-green-700' : 'text-gray-500'} flex-1 min-w-0`}>
                      {course.name}
                      {course.id === null && <span className="text-gray-400"> (מ"ק ?)</span>}
                    </span>
                    {course.id !== null && !placed && renderMinorAddButton(course.id)}
                  </div>
                );
              })}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-700">
                {`קורסי בחירה שסומנו: ${ep.electivesCompleted}`}
              </p>
              {ENTREPRENEURSHIP_COURSES.filter((c) => !c.mandatory).map((course) => {
                const placed = course.id !== null && allPlaced.has(course.id);
                return (
                  <div key={course.name} className="flex items-center gap-1.5 text-xs">
                    <span className={`font-bold shrink-0 ${placed ? 'text-green-600' : 'text-gray-400'}`}>
                      {placed ? '✓' : '○'}
                    </span>
                    <span className={`${placed ? 'text-green-700' : 'text-gray-500'} flex-1 min-w-0`}>
                      {course.name}
                      {course.id === null && <span className="text-gray-400"> (מ"ק ?)</span>}
                    </span>
                    {course.id !== null && !placed && renderMinorAddButton(course.id)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="border-t pt-3 mt-1 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-700">קבוצות התמחות</span>
          <span className={`text-sm font-bold ${
            progress.specializationGroups.unavailable
              ? 'text-amber-700'
              : progress.specializationGroups.completed >= progress.specializationGroups.required
                ? 'text-green-600'
                : 'text-gray-600'
          }`}>
            {progress.specializationGroups.unavailable ? 'לא זמין' : `${progress.specializationGroups.completed} / ${progress.specializationGroups.required}`}
            {progress.specializationGroups.completed >= progress.specializationGroups.required ? ' הושלם' : ''}
          </span>
        </div>
        {progress.specializationGroups.unavailable && (
          <p className="text-xs text-amber-700">
            קבצי ההתמחויות למסלול הזה אינם תקינים כרגע ולכן ההתקדמות בהתמחויות לא מחושבת.
          </p>
        )}
        {progress.groupDetails.length > 0 && (
          <div className="space-y-1 pr-1">
            {progress.groupDetails.map((group) => (
              <div key={group.id}>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 truncate max-w-[120px]" title={group.name}>{group.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {group.isDouble && <span className="text-xs bg-purple-100 text-purple-600 px-1 rounded font-medium">כפול</span>}
                    <span className={`text-xs font-medium ${group.done >= group.min ? 'text-green-600' : 'text-gray-500'}`}>
                      {group.done}/{group.min}{group.done >= group.min ? ' הושלם' : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-700">ממוצע משוקלל</span>
          <span className="text-sm font-bold text-gray-800">
            {weightedAverage !== null ? weightedAverage.toFixed(1) : '—'}
          </span>
        </div>

        <div className="space-y-2 pt-1">
          {compactRequirements.map((req) => {
            if (req.requirementId === 'general_electives') {
              return (
                <GeneralElectivesRow
                  key={req.requirementId}
                  req={req}
                  breakdown={progress.generalElectivesBreakdown}
                  manualEnglishCourseIds={generalElectivesManualEnglishCourseIds}
                  englishTaughtCourses={englishTaughtCourses}
                  onToggleEnglishCourse={toggleEnglishTaughtCourse}
                />
              );
            }

            return (
              <CompactRequirementRow
                key={req.requirementId}
                req={req}
                targetValue={req.requirementId === 'english' ? req.targetValue : undefined}
                missingValue={req.requirementId === 'english' ? Math.max(0, req.targetValue - req.completedValue) : undefined}
                manualEnglishCourseIds={[]}
                englishTaughtCourses={englishTaughtCourses}
                onToggleEnglishCourse={toggleEnglishTaughtCourse}
                englishScore={req.requirementId === 'english' ? progress.english.score : undefined}
                onSetEnglishScore={req.requirementId === 'english' ? setEnglishScore : undefined}
                englishRequirementItems={req.requirementId === 'english' ? progress.english.requirements : undefined}
              />
            );
          })}
        </div>

      </div>
    </div>
  );
});

RequirementsPanel.displayName = 'RequirementsPanel';

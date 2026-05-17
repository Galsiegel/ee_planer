import { useMemo, useState } from 'react';
import type { SapCourse, TrackDefinition, PlanVersion } from '../types';
import { getTrackSpecializationCatalog } from '../domain/specializations';
import { computeRequirementsProgress } from '../hooks/usePlan';
import { computeWeightedAverage } from '../utils/courseGrades';
import { getComparisonSemesterLabel, getDifferingCourseIds } from '../utils/versionComparison';
import {
  computeNoAdditionalCreditConflicts,
  getNoAdditionalCreditCourseIds,
} from '../domain/noAdditionalCredit';

interface Props {
  versions: PlanVersion[];
  courses: Map<string, SapCourse>;
  trackDefs: TrackDefinition[];
  onClose: () => void;
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

interface VersionColumnProps {
  version: PlanVersion;
  courses: Map<string, SapCourse>;
  trackDefs: TrackDefinition[];
  showOnlyDifferentCourses: boolean;
  differingCourseIds: Set<string>;
}

function VersionColumn({
  version,
  courses,
  trackDefs,
  showOnlyDifferentCourses,
  differingCourseIds,
}: VersionColumnProps) {
  const plan = version.plan;
  const trackDef = trackDefs.find((t) => t.id === plan.trackId) ?? null;
  const catalog = plan.trackId ? getTrackSpecializationCatalog(plan.trackId, plan.catalogYear) : null;
  const noAdditionalCreditCourseIds = useMemo(
    () => getNoAdditionalCreditCourseIds(
      computeNoAdditionalCreditConflicts(courses, {
        completedCourses: plan.completedCourses ?? [],
        semesters: plan.semesters ?? {},
        semesterOrder: plan.semesterOrder ?? [],
        noAdditionalCreditOverrides: plan.noAdditionalCreditOverrides,
      }),
    ),
    [
      courses,
      plan.completedCourses,
      plan.semesters,
      plan.semesterOrder,
      plan.noAdditionalCreditOverrides,
    ],
  );

  const weightedAverage = useMemo(
    () => computeWeightedAverage({
      semesters: plan.semesters ?? {},
      grades: plan.grades ?? {},
      binaryPass: plan.binaryPass ?? {},
      noAdditionalCreditCourseIds,
    }, courses),
    [plan.semesters, plan.grades, plan.binaryPass, noAdditionalCreditCourseIds, courses],
  );

  const progress = useMemo(() => {
    if (!trackDef || !catalog) return null;
    return computeRequirementsProgress(
      {
        semesters: plan.semesters,
        completedCourses: plan.completedCourses,
        completedInstances: plan.completedInstances ?? [],
        grades: plan.grades ?? {},
        binaryPass: plan.binaryPass ?? {},
        selectedSpecializations: plan.selectedSpecializations,
        doubleSpecializations: plan.doubleSpecializations ?? [],
        hasEnglishExemption: plan.hasEnglishExemption ?? false,
        miluimCredits: plan.miluimCredits ?? 0,
        englishScore: plan.englishScore,
        englishTaughtCourses: plan.englishTaughtCourses ?? [],
        semesterOrder: plan.semesterOrder,
        coreToChainOverrides: plan.coreToChainOverrides ?? [],
        courseChainAssignments: plan.courseChainAssignments,
        electiveCreditAssignments: plan.electiveCreditAssignments,
        noAdditionalCreditOverrides: plan.noAdditionalCreditOverrides,
        roboticsMinorEnabled: plan.roboticsMinorEnabled ?? false,
        entrepreneurshipMinorEnabled: plan.entrepreneurshipMinorEnabled ?? false,
        quantumComputingMinorEnabled: plan.quantumComputingMinorEnabled ?? false,
      },
      courses,
      trackDef,
      catalog,
      weightedAverage,
    );
  }, [plan, trackDef, catalog, courses, weightedAverage]);

  // Build semester list from semesterOrder
  const semesterOrder = plan.semesterOrder ?? [];
  const semesters = plan.semesters ?? {};

  return (
    <div className="flex-1 min-w-0 w-full border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
        <div className="font-semibold text-gray-800 text-sm truncate">{version.name}</div>
        {trackDef && <div className="text-xs text-gray-500">{trackDef.name}</div>}
        {weightedAverage !== null && (
          <div className="text-xs text-gray-500">ממוצע: {weightedAverage.toFixed(2)}</div>
        )}
      </div>

      {/* Requirements */}
      {progress && (
        <div className="px-3 pt-3 pb-2 border-b border-gray-100">
          <div className="text-xs font-semibold text-gray-500 mb-2">דרישות</div>
          {[
            { label: 'חובה', earned: progress.mandatory.earned, required: progress.mandatory.required, color: 'bg-blue-500' },
            { label: 'בחירה', earned: progress.elective.earned, required: progress.elective.required, color: 'bg-emerald-500' },
            { label: 'סה"כ', earned: progress.total.earned, required: progress.total.required, color: 'bg-gray-500' },
          ].map(({ label, earned, required, color }) => (
            <div key={label} className="mb-2">
              <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                <span>{label}</span>
                <span className={earned >= required ? 'text-green-600 font-medium' : ''}>
                  {earned.toFixed(0)} / {required}
                </span>
              </div>
              <ProgressBar pct={required > 0 ? (earned / required) * 100 : 0} color={color} />
            </div>
          ))}
          <div className="text-xs text-gray-600 mt-1">
            התמחויות: {progress.specializationGroups.completed} / {progress.specializationGroups.required}
          </div>
        </div>
      )}

      {/* Specializations */}
      {plan.selectedSpecializations?.length > 0 && (
        <div className="px-3 pt-2 pb-2 border-b border-gray-100">
          <div className="text-xs font-semibold text-gray-500 mb-1">התמחויות נבחרות</div>
          <div className="flex flex-wrap gap-1">
            {plan.selectedSpecializations.map((id) => {
              const group = catalog?.groups.find((g) => g.id === id);
              const isDouble = plan.doubleSpecializations?.includes(id);
              return (
                <span key={id} className="text-xs bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5">
                  {group?.name ?? id}{isDouble ? ' ×2' : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Semesters */}
      <div className="px-3 pt-2 pb-3">
        <div className="text-xs font-semibold text-gray-500 mb-2">סמסטרים</div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {semesterOrder.map((sem) => {
            const courseIds = semesters[sem] ?? [];
            const visibleCourseIds = showOnlyDifferentCourses
              ? courseIds.filter((id) => differingCourseIds.has(id))
              : courseIds;
            if (visibleCourseIds.length === 0) return null;
            return (
              <div key={sem}>
                <div className="text-xs text-gray-400 mb-0.5">
                  {getComparisonSemesterLabel(sem, semesterOrder, plan.summerSemesters ?? [])}
                </div>
                <div className="flex flex-wrap gap-1">
                  {visibleCourseIds.map((id, i) => (
                    <span
                      key={`${id}_${i}`}
                      className="max-w-full whitespace-normal break-words rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                      title={courses.get(id)?.name ?? id}
                    >
                      {courses.get(id)?.name ?? id}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function VersionCompareModal({ versions, courses, trackDefs, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(versions.slice(0, Math.min(versions.length, 2)).map((v) => v.id)),
  );
  const [showOnlyDifferentCourses, setShowOnlyDifferentCourses] = useState(false);

  function toggleVersion(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        if (next.size >= 4) return prev;
        next.add(id);
      }
      return next;
    });
  }

  const selectedVersions = useMemo(
    () => versions.filter((v) => selected.has(v.id)),
    [versions, selected],
  );
  const differingCourseIds = useMemo(
    () => getDifferingCourseIds(selectedVersions),
    [selectedVersions],
  );
  const isDifferenceFilterActive = showOnlyDifferentCourses && selectedVersions.length >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col mx-2 sm:mx-4">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">השוואת גרסאות</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        {/* Version selector */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">בחר גרסאות:</span>
          {versions.map((v) => (
            <button
              key={v.id}
              onClick={() => toggleVersion(v.id)}
              className={[
                'px-3 py-1 rounded-lg text-sm border transition-colors',
                selected.has(v.id)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300',
              ].join(' ')}
            >
              {v.name}
            </button>
          ))}
          {selectedVersions.length >= 2 && (
            <button
              type="button"
              onClick={() => setShowOnlyDifferentCourses((current) => !current)}
              aria-pressed={showOnlyDifferentCourses}
              className={[
                'px-3 py-1 rounded-lg text-sm border transition-colors',
                showOnlyDifferentCourses
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300',
              ].join(' ')}
            >
              {showOnlyDifferentCourses ? 'הצג הכל' : 'רק קורסים שונים'}
            </button>
          )}
        </div>

        {/* Comparison columns */}
        <div className="flex-1 overflow-y-auto p-5">
          {isDifferenceFilterActive && differingCourseIds.size === 0 && (
            <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              אין הבדלים בקורסים בין הגרסאות שנבחרו.
            </div>
          )}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-start">
            {selectedVersions.map((v) => (
              <VersionColumn
                key={v.id}
                version={v}
                courses={courses}
                trackDefs={trackDefs}
                showOnlyDifferentCourses={isDifferenceFilterActive}
                differingCourseIds={differingCourseIds}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

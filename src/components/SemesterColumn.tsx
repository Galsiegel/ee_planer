import { memo, useDeferredValue, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CourseCard } from './CourseCard';
import type { SapCourse } from '../types';
import { bareId } from '../utils/occurrenceId';
import type { NoAdditionalCreditConflict } from '../domain/noAdditionalCredit';
import { getRecognizedCredits } from '../domain/noAdditionalCredit';

const SEM_LABELS = [
  'לא משובץ',
  'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳',
  'ח׳', 'ט׳', 'י׳', 'יא׳', 'יב׳', 'יג׳', 'יד׳', 'טו׳', 'טז׳',
];

interface Props {
  semester: number;
  courseIds: string[];
  courses: Map<string, SapCourse>;
  mandatoryCourseIds: Set<string>;
  prereqStatus: Map<string, string[][]>;
  completedCourses: Set<string>;
  effectiveCompleted: Set<string>;
  isSummer: boolean;
  regularIndex?: number;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  onSetCurrentSemester: (n: number | null) => void;
  summerIndex?: number;
  isRowMode?: boolean;
  semesterType?: 'winter' | 'spring' | 'summer';
  onSetSemesterType?: (type: 'winter' | 'spring') => void;
  warningsIgnored?: boolean;
  onToggleWarnings?: () => void;
  semesterAverage?: number | null;
  courseChainMap?: Map<string, string>;
  coreLockedSet?: Set<string>;
  isDragging?: boolean;
  ruleWarnings?: ('melag' | 'sport')[];
  mutualExclusionWarnings?: string[];
  noAdditionalCreditConflicts?: Map<string, NoAdditionalCreditConflict[]>;
  noAdditionalCreditCourseIds?: ReadonlySet<string>;
  onMarkSemesterComplete?: () => void;
  readOnly?: boolean;
}

function getColumnStyle(isOver: boolean, isDragging: boolean, isSummer: boolean, isCurrent: boolean, isPast: boolean, isFuture: boolean): string {
  if (isOver)     return 'sem-col-over';
  if (isDragging) return isSummer ? 'border-amber-400 border-dashed bg-amber-50/60' : 'border-blue-300 border-dashed bg-blue-50/10';
  if (isSummer)   return 'sem-col-summer';
  if (isCurrent)  return 'sem-col-current';
  if (isPast)     return 'sem-col-past';
  if (isFuture)   return 'sem-col-future';
  return 'sem-col-default';
}

export const SemesterColumn = memo(function SemesterColumn({
  semester, courseIds, courses, mandatoryCourseIds, prereqStatus,
  completedCourses, effectiveCompleted, isSummer, regularIndex, isCurrent, isPast, isFuture, onSetCurrentSemester,
  summerIndex, isRowMode,
  semesterType, onSetSemesterType, warningsIgnored, onToggleWarnings, semesterAverage, courseChainMap, coreLockedSet, isDragging: isDraggingActive,
  ruleWarnings = [],
  mutualExclusionWarnings = [],
  noAdditionalCreditConflicts = new Map(),
  noAdditionalCreditCourseIds = new Set(),
  onMarkSemesterComplete,
  readOnly = false,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `semester-${semester}`, disabled: readOnly });
  const {
    attributes, listeners,
    setNodeRef: setSortableRef,
    transform, transition, isDragging,
  } = useSortable({ id: `col-${semester}`, disabled: readOnly || semester === 0 });
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const totalCredits = courseIds.reduce((s, id) => s + getRecognizedCredits(courses.get(bareId(id)), noAdditionalCreditCourseIds), 0);
  const columnStyle = getColumnStyle(isOver, !!(isDraggingActive && semester > 0), isSummer, isCurrent, isPast, isFuture);
  const setColumnRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (semester > 0) {
      setSortableRef(node);
    }
  };

  const semesterLabel = semester === 0
    ? 'לא משובץ'
    : isSummer
      ? `קיץ ${SEM_LABELS[summerIndex ?? semester]}`
      : `סמסטר ${SEM_LABELS[regularIndex ?? semester]}`;

  // Filter for search in the unassigned column
  const filteredIds = useMemo(() => {
    const trimmedSearch = deferredSearch.trim();
    if (semester !== 0 || !trimmedSearch) {
      return courseIds;
    }

    const normalizedSearch = trimmedSearch.toLowerCase();
    return courseIds.filter((id) => {
      const course = courses.get(bareId(id));
      return bareId(id).includes(trimmedSearch) || course?.name.toLowerCase().includes(normalizedSearch);
    });
  }, [semester, deferredSearch, courseIds, courses]);

  const sortableStyle = semester > 0 ? {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  } : undefined;

  return (
    <div
      ref={setColumnRef}
      style={sortableStyle}
      data-print-col
      className={`flex flex-col rounded-2xl border-2 min-h-44 transition-all duration-200 ${columnStyle}`}
    >
      <div className={`px-3 py-2.5 rounded-t-2xl border-b ${isSummer ? 'bg-amber-50/80 border-amber-200/70' : 'bg-white/90 border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {/* Drag handle for reordering */}
            {semester > 0 && !readOnly && (
              <div
                {...attributes}
                {...listeners}
                style={{ touchAction: 'none' }}
                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 text-base select-none leading-none"
                title="גרור לשינוי סדר"
              >⠿</div>
            )}
            {isSummer && <span className="text-sm">☀️</span>}
            {!isSummer && semester > 0 && !readOnly && semesterType && semesterType !== 'summer' && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onSetSemesterType?.(semesterType === 'winter' ? 'spring' : 'winter'); }}
                className="text-sm leading-none opacity-60 hover:opacity-100 transition-opacity"
                title={semesterType === 'winter' ? 'לחץ לשנות לאביב' : 'לחץ לשנות לחורף'}
              >
                {semesterType === 'winter' ? '❄️' : '🌸'}
              </button>
            )}
            <span className="font-semibold text-slate-700 text-sm tracking-tight">{semesterLabel}</span>
            {isCurrent && (
              <span className="text-xs text-white px-2 py-0.5 rounded-full font-semibold" style={{ background: '#2c61ad' }}>
                נוכחי
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {semester > 0 && !readOnly && courseIds.length > 0 && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onMarkSemesterComplete?.(); }}
                className={`text-xs px-1 py-0.5 rounded border transition-colors ${
                  courseIds.every((id) => completedCourses.has(id))
                    ? 'text-green-600 border-green-300 bg-green-50 hover:bg-green-100'
                    : 'text-gray-300 border-gray-200 hover:text-green-500'
                }`}
                title={courseIds.every((id) => completedCourses.has(id)) ? 'בטל סימון הושלם' : 'סמן הכל כהושלם'}
              >✓</button>
            )}
            {semester > 0 && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium tabular-nums">
                {totalCredits.toFixed(1)} נ״ז
              </span>
            )}
            {semester > 0 && semesterAverage !== null && semesterAverage !== undefined && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums" style={{ background: '#eff4fb', color: '#1e4d93' }} title="ממוצע סמסטר משוקלל">
                ∅ {semesterAverage.toFixed(1)}
              </span>
            )}
            {isSummer && !readOnly && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onToggleWarnings?.(); }}
                className={`text-xs px-1 py-0.5 rounded border transition-colors ${warningsIgnored ? 'text-gray-300 border-gray-200 hover:text-amber-400' : 'text-amber-500 border-amber-200 bg-amber-50 hover:bg-amber-100'}`}
                title={warningsIgnored ? 'הצג אזהרות עונה' : 'התעלם מאזהרות עונה'}
              >⚠️</button>
            )}
            {semester > 0 && !readOnly && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSetCurrentSemester(isCurrent ? null : semester);
                }}
                className={`text-base leading-none transition-colors ${isCurrent ? 'text-blue-500' : 'text-gray-300 hover:text-blue-400'}`}
                title={isCurrent ? 'בטל סמסטר נוכחי' : 'הגדר כסמסטר נוכחי'}
              >
                📍
              </button>
            )}
          </div>
        </div>

        {/* Search input for unassigned column */}
        {semester === 0 && (
          <div className="mt-1.5 relative">
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש קורס..."
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full text-xs pr-6 pl-2 py-1 border border-gray-200 rounded-lg bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-300"
            />
          </div>
        )}
      </div>

      {/* Technion rule warnings */}
      {ruleWarnings.length > 0 && semester > 0 && (
        <div className="px-2 pb-1 space-y-1">
          {ruleWarnings.includes('melag') && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              ⚠️ בטכניון ניתן לקחת עד 2 מל&quot;גים בסמסטר אחד
            </p>
          )}
          {ruleWarnings.includes('sport') && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              ⚠️ בטכניון ניתן לקחת קורס ספורט אחד בסמסטר
            </p>
          )}
        </div>
      )}

      {mutualExclusionWarnings.length > 0 && semester > 0 && (
        <div className="px-2 pb-1 space-y-1">
          {mutualExclusionWarnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {warning}
            </p>
          ))}
        </div>
      )}

      <div className={`gap-1.5 p-2 flex-1 ${isRowMode ? 'grid grid-cols-2 sm:grid-cols-3' : 'flex flex-col'}`}>
        {filteredIds.map((id, idx) => {
          const course = courses.get(bareId(id));
          if (!course) {
            return (
              <div
                key={`${id}_${idx}`}
                className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-700"
                title="Missing static course data"
              >
                <div className="font-semibold">חסר מידע קורס</div>
                <div className="font-mono text-[11px]">{id}</div>
              </div>
            );
          }
          const missingPrereqGroups = prereqStatus.get(id) ?? [];
          const courseNoAdditionalCreditConflicts = noAdditionalCreditConflicts.get(id) ?? [];
          const recognizedCredits = getRecognizedCredits(course, noAdditionalCreditCourseIds);
          const wrongSemesterType = !!(
            semesterType
            && course.teachingSemester
            && !warningsIgnored
            && (semesterType === 'summer' || course.teachingSemester !== semesterType)
          );
          return (
            <CourseCard
              key={`${id}_${idx}`}
              course={course}
              courses={courses}
              isMandatory={mandatoryCourseIds.has(bareId(id))}
              hasPrereqWarning={missingPrereqGroups.length > 0}
              missingPrereqGroups={missingPrereqGroups}
              noAdditionalCreditConflicts={courseNoAdditionalCreditConflicts}
              recognizedCredits={recognizedCredits}
              isCompleted={effectiveCompleted.has(id)}
              isPlanned={isFuture && !completedCourses.has(id)}
              semester={semester}
              instanceKey={id}
              wrongSemesterType={wrongSemesterType}
              chainName={courseChainMap?.get(id)}
              isCoreLocked={coreLockedSet?.has(id) ?? false}
              draggable={!readOnly}
              showActions={!readOnly}
            />
          );
        })}
        {filteredIds.length === 0 && !isOver && (
          <p className="text-xs text-gray-400 text-center py-6 italic">
            {semester === 0
              ? (search.trim() ? 'אין קורסים תואמים' : 'כל הקורסים משובצים')
              : isDraggingActive ? '' : 'גרור קורסים לכאן'}
          </p>
        )}
        {isDraggingActive && isOver && (
          <div className="mt-1 mb-1 flex items-center justify-center gap-1.5 text-blue-600 text-xs font-semibold py-2 bg-blue-100 rounded-lg border-2 border-blue-400 border-dashed">
            <span>📥</span>
            <span>שחרר כאן</span>
          </div>
        )}
        {isDraggingActive && !isOver && semester > 0 && filteredIds.length === 0 && (
          <p className="text-xs text-blue-400 text-center py-6 italic">גרור לכאן</p>
        )}
      </div>
    </div>
  );
});

SemesterColumn.displayName = 'SemesterColumn';

import { lazy, memo, Suspense, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useShallow } from 'zustand/react/shallow';
import type { SapCourse } from '../types';
import type { NoAdditionalCreditConflict } from '../domain/noAdditionalCredit';
import { usePlanStore, gradeKey, REPEATABLE_COURSES } from '../store/planStore';
import { getFacultyStyle } from '../utils/faculty';
import { getTeachingSemesterBadge } from '../utils/teachingSemester';
import { isCourseTaughtInEnglish, isFreeElectiveCourseId } from '../data/generalRequirements/courseClassification';
import { useShareMode } from '../context/ShareModeContext';

interface Props {
  course: SapCourse;
  isMandatory: boolean;
  hasPrereqWarning?: boolean;
  isCompleted?: boolean;
  isPlanned?: boolean;
  missingPrereqGroups?: string[][];
  noAdditionalCreditConflicts?: NoAdditionalCreditConflict[];
  recognizedCredits?: number;
  courses?: Map<string, SapCourse>;
  semester?: number;
  instanceKey?: string;
  wrongSemesterType?: boolean;
  chainName?: string;
  isCoreLocked?: boolean;
  draggable?: boolean;
  showActions?: boolean;
}

const LazyCourseDetailModal = lazy(async () => {
  const module = await import('./CourseDetailModal');
  return { default: module.CourseDetailModal };
});

export const CourseCard = memo(function CourseCard({
  course,
  isMandatory,
  hasPrereqWarning,
  isCompleted,
  isPlanned,
  missingPrereqGroups = [],
  noAdditionalCreditConflicts = [],
  recognizedCredits,
  courses = new Map(),
  semester,
  instanceKey,
  wrongSemesterType,
  chainName,
  isCoreLocked,
  draggable = true,
  showActions = true,
}: Props) {
  const shareMode = useShareMode();
  const isReadOnly = shareMode?.isShareReview ?? false;
  const effectiveDraggable = draggable && !isReadOnly;
  const draggableId = instanceKey ?? course.id;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    data: { course },
    disabled: !effectiveDraggable,
  });
  const effectiveId = instanceKey ?? course.id;
  const {
    toggleFavorite,
    toggleCompleted,
    removeCourseFromSemester,
    isFavorite,
    grade,
    isBinaryPass,
    isCompletedViaStore,
    facultyColorOverrides,
    englishTaughtCourses,
  } = usePlanStore(useShallow((state) => ({
    toggleFavorite: state.toggleFavorite,
    toggleCompleted: state.toggleCompleted,
    removeCourseFromSemester: state.removeCourseFromSemester,
    isFavorite: state.favorites.includes(course.id),
    grade: state.grades[gradeKey(effectiveId, semester)],
    isBinaryPass: !!(state.binaryPass ?? {})[effectiveId],
    isCompletedViaStore: REPEATABLE_COURSES.has(effectiveId)
      ? (state.completedCourses ?? []).includes(effectiveId)
      : false,
    facultyColorOverrides: state.facultyColorOverrides ?? {},
    englishTaughtCourses: state.englishTaughtCourses ?? [],
  })));
  const isRepeatable = REPEATABLE_COURSES.has(course.id);
  const effectiveIsCompleted = isRepeatable && instanceKey
    ? isCompletedViaStore
    : isCompleted;
  const [modalOpen, setModalOpen] = useState(false);
  const showsEnglishBadge = isCourseTaughtInEnglish(course, englishTaughtCourses);
  const showsFreeElectiveBadge = isFreeElectiveCourseId(course.id);
  const showCardActions = showActions && !isDragging && !isReadOnly;
  const hasNoAdditionalCreditWarning = noAdditionalCreditConflicts.length > 0;
  const displayedCredits = recognizedCredits ?? course.credits;

  const style: React.CSSProperties = {
    ...(effectiveDraggable ? { touchAction: 'none' } : {}),
    ...(effectiveDraggable && transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 999 } : {}),
  };

  let colorClass = 'bg-white border-slate-200 hover:border-slate-300';
  if (wrongSemesterType) colorClass = 'bg-red-50 border-red-200 hover:border-red-300';
  else if (effectiveIsCompleted) colorClass = 'bg-emerald-50 border-emerald-200';
  else if (hasPrereqWarning || hasNoAdditionalCreditWarning) colorClass = 'bg-amber-50 border-amber-200';
  else if (isMandatory) colorClass = 'bg-blue-50 border-blue-200 hover:border-blue-300';

  const namedGroups = missingPrereqGroups.filter((group) =>
    group.every((id) => courses.get(id)?.name !== undefined)
  );
  const candidateGroups = namedGroups.length > 0 ? namedGroups : missingPrereqGroups;
  const bestGroup = missingPrereqGroups.length > 0
    ? candidateGroups.reduce((min, group) => group.length < min.length ? group : min, candidateGroups[0])
    : [];
  const displayedNames = bestGroup.slice(0, 2).map((id) => courses.get(id)?.name ?? id);
  const hasMoreInGroup = bestGroup.length > 2;

  const facultyStyle = course.faculty
    ? getFacultyStyle(course.faculty, course.id, facultyColorOverrides)
    : null;
  const seasonBadge = getTeachingSemesterBadge(course.teachingSemester);

  return (
    <>
      <div
        ref={effectiveDraggable ? setNodeRef : undefined}
        style={style}
        {...(effectiveDraggable ? listeners : {})}
        {...(effectiveDraggable ? attributes : {})}
        onClick={() => {
          if (effectiveDraggable) setModalOpen(true);
        }}
        className={`
          ${colorClass} border rounded-xl p-2.5 relative overflow-hidden card-elevated
          ${effectiveDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} select-none
          ${isDragging ? 'opacity-50 shadow-2xl scale-105 rotate-1' : effectiveDraggable ? 'active:scale-95' : ''}
          ${isPlanned && !isDragging ? 'opacity-55' : ''}
          transition-all duration-150
        `}
      >
        {showCardActions && (
          <div dir="ltr" className="absolute top-0 left-0 flex items-center">
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(course.id);
            }}
            className={`w-14 h-14 flex items-center justify-center text-sm leading-none transition-colors ${isFavorite ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}
            title={isFavorite ? 'הסר ממועדפים' : 'הוסף למועדפים'}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          {semester !== undefined && (
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                removeCourseFromSemester(effectiveId, semester);
              }}
              className="w-14 h-14 flex items-center justify-center text-xl leading-none font-semibold text-gray-300 hover:text-red-500 transition-colors"
              title={semester === 0 ? 'הסר מהתכנית' : 'הסר מהסמסטר'}
              aria-label={semester === 0 ? 'הסר מהתכנית' : 'הסר מהסמסטר'}
            >
              ×
            </button>
          )}
          </div>
        )}

        {showCardActions && semester !== undefined && (
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleCompleted(effectiveId);
            }}
            className={`absolute top-0 right-0 w-11 h-11 flex items-center justify-center text-sm leading-none font-bold transition-colors ${effectiveIsCompleted ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-400'}`}
            title={effectiveIsCompleted ? 'סמן כלא הושלם' : 'סמן כהושלם'}
          >
            {effectiveIsCompleted ? '✓' : '○'}
          </button>
        )}

        <p className={`text-xs font-semibold text-slate-800 leading-snug pt-0.5 ${showCardActions ? 'pr-11 pl-28' : ''}`}>{course.name}</p>

        {wrongSemesterType && (
          <p className="text-xs text-red-500 mt-0.5 px-4 leading-tight">
            {course.teachingSemester === 'winter' ? '❄️ קורס חורף בלבד' : '🌸 קורס אביב בלבד'}
          </p>
        )}

        {missingPrereqGroups.length > 0 && bestGroup.length > 0 && (
          <div className="mt-1 px-4 space-y-0.5">
            {displayedNames.map((name, index) => (
              <p key={index} className="text-xs text-orange-500 leading-tight">נותר: {name}</p>
            ))}
            {hasMoreInGroup && <p className="text-xs text-orange-400 leading-tight">...</p>}
          </div>
        )}

        {hasNoAdditionalCreditWarning && (
          <div className="mt-1 px-4 space-y-0.5">
            {noAdditionalCreditConflicts.slice(0, 2).map((conflict) => {
              const conflictingCourse = courses.get(conflict.conflictingCourseId);
              return (
                <p key={conflict.pairKey} className="text-xs text-orange-500 leading-tight">
                  ללא זיכוי נוסף: {conflictingCourse?.name ?? conflict.conflictingCourseId}
                </p>
              );
            })}
            {noAdditionalCreditConflicts.length > 2 && <p className="text-xs text-orange-400 leading-tight">...</p>}
          </div>
        )}

        <div className="flex items-center justify-between mt-1.5 gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-gray-400 shrink-0">{course.id}</span>
            {facultyStyle && (
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${facultyStyle.dot}`}
                title={course.faculty}
              />
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {seasonBadge && (
              <span className="text-xs leading-none" title={seasonBadge.title}>
                {seasonBadge.emoji}
              </span>
            )}
            {showsEnglishBadge && (
              <span className="text-xs bg-sky-50 text-sky-600 px-1 py-0.5 rounded font-semibold leading-none" title="קורס באנגלית">
                EN
              </span>
            )}
            {showsFreeElectiveBadge && (
              <span className="text-xs bg-amber-50 text-amber-700 px-1 py-0.5 rounded font-semibold leading-none" title="בחירה חופשית">
                ב"ח
              </span>
            )}
            <span
              className={`text-xs px-1 py-0.5 rounded font-medium leading-none ${
                isCoreLocked ? 'bg-amber-100 text-amber-700' : isMandatory ? 'bg-blue-100 text-blue-600' : chainName ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'
              }`}
              title={isCoreLocked ? 'קורס נספר כליבה' : (!isMandatory && chainName ? chainName : undefined)}
            >
              {isCoreLocked ? 'ליבה' : isMandatory ? 'חובה' : (chainName ?? 'בחירה')}
            </span>
            {isBinaryPass && (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">עובר</span>
            )}
            {grade !== undefined && !isBinaryPass && (
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{grade}</span>
            )}
            {(hasPrereqWarning || hasNoAdditionalCreditWarning) && (
              <span
                className="text-xs"
                title={hasNoAdditionalCreditWarning ? 'ללא זיכוי נוסף' : 'קדמים חסרים'}
              >⚠️</span>
            )}
            <span
              className={`text-xs font-bold ${displayedCredits === 0 && course.credits > 0 ? 'text-orange-600 line-through decoration-orange-500' : 'text-gray-600'}`}
              title={displayedCredits === 0 && course.credits > 0 ? `${course.credits} נק"ז מקוריות, 0 נק"ז מוכרות` : undefined}
            >
              {displayedCredits} נק"ז
            </span>
          </div>
        </div>
      </div>

      {modalOpen && (
        <Suspense
          fallback={(
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        >
          <LazyCourseDetailModal
            course={course}
            courses={courses}
            semester={semester}
            instanceKey={instanceKey}
            noAdditionalCreditConflicts={noAdditionalCreditConflicts}
            isCoreLocked={isCoreLocked}
            onClose={() => setModalOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
});

CourseCard.displayName = 'CourseCard';

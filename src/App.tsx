import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { fetchCourses } from './services/sapApi';
import { isRetryableSyncError, savePlanToCloud, subscribeToCloudPlan } from './services/cloudSync';
import { subscribeToMyShares, subscribeToShare, updateSharedEnvelope, type ShareSnapshot } from './services/shareApi';
import { usePlanStore } from './store/planStore';
import { buildEnvelopeFromState, getPlanSignature, shouldApplyCloudEnvelope } from './services/planSync';
import { VersionTabs } from './components/VersionTabs';
import { VersionCompareModal } from './components/VersionCompareModal';
import { useAuth } from './context/AuthContext';
import { TrackSelector } from './components/TrackSelector';
import { SemesterGrid } from './components/SemesterGrid';
import { RequirementsPanel } from './components/RequirementsPanel';
import { SpecializationPanel } from './components/SpecializationPanel';
import { CourseSearch } from './components/CourseSearch';
import { ChainRecommendations } from './components/ChainRecommendations';
import { LoginButton } from './components/LoginButton';
import { Toast } from './components/Toast';
import { MobileSidebarDrawer } from './components/MobileSidebarDrawer';
import { ExportShareModal } from './components/ExportShareModal';
import { PrintView } from './components/PrintView';
import { resolveTrackForYear, getAvailableYears } from './domain/resolveTrack';
import { eeTrack } from './data/tracks/ee';
import { csTrack } from './data/tracks/cs';
import { eeMathTrack } from './data/tracks/ee_math';
import { eePhysicsTrack } from './data/tracks/ee_physics';
import { eeCombinedTrack } from './data/tracks/ee_combined';
import { ceTrack } from './data/tracks/ce';
import type { SapCourse, TrackDefinition, VersionedPlanEnvelope } from './types';
import { useRequirementsProgress, useWeightedAverage } from './hooks/usePlan';
import { useDegreeCompletionCheck } from './hooks/useDegreeCompletionCheck';
import { DegreeCompletionModal } from './components/DegreeCompletionModal';
import { getRecommendedCourseIdsForEntry, getAllScheduledCourseIds } from './data/tracks/semesterSchedule';
import {
  getTrackSpecializationCatalog,
  reportTrackSpecializationDiagnostics,
} from './domain/specializations';
import { reportMissingStaticCourseReferences } from './domain/staticCourseDiagnostics';
import { useShareMode } from './context/ShareModeContext';

// UI timing constants
const TOAST_DURATION_MS = 2500;
const SAVE_DEBOUNCE_MS = 2000;
const TRACK_SWITCH_DEBOUNCE_MS = 800;
const SYNC_RETRY_DELAY_MS = 5000;

const ALL_TRACKS: TrackDefinition[] = [eeTrack, csTrack, eeMathTrack, eePhysicsTrack, eeCombinedTrack, ceTrack];

function extractEnvelope(
  state: ReturnType<typeof usePlanStore.getState>,
  activeVersionUpdatedAt?: number,
): VersionedPlanEnvelope {
  return buildEnvelopeFromState(state, { activeVersionUpdatedAt });
}

function PlannerApp({ courses, trackDef, availableYears }: { courses: Map<string, SapCourse>; trackDef: TrackDefinition; availableYears: number[] }) {
  const {
    trackId,
    resetPlan,
    beginTrackSwitch,
    finishTrackSwitch,
    resetToDefault,
    undo,
    semesters,
    addCourseToSemester,
    loadEnvelope,
    _history,
    isSwitchingTrack,
    dismissedRecommendedCourses,
    englishScore,
    markTrackInitialized,
    versions,
    hasPendingCloudSync,
    markCloudSyncPending,
    markCloudSyncSettled,
    copyShareReviewToEditableVersion,
    catalogYear,
    setCatalogYear,
    switchCatalogYear,
  } = usePlanStore(useShallow((state) => ({
    trackId: state.trackId,
    resetPlan: state.resetPlan,
    beginTrackSwitch: state.beginTrackSwitch,
    finishTrackSwitch: state.finishTrackSwitch,
    resetToDefault: state.resetToDefault,
    undo: state.undo,
    semesters: state.semesters,
    addCourseToSemester: state.addCourseToSemester,
    loadEnvelope: state.loadEnvelope,
    _history: state._history,
    isSwitchingTrack: state.isSwitchingTrack,
    dismissedRecommendedCourses: state.dismissedRecommendedCourses,
    englishScore: state.englishScore,
    markTrackInitialized: state.markTrackInitialized,
    versions: state.versions,
    hasPendingCloudSync: state.hasPendingCloudSync,
    markCloudSyncPending: state.markCloudSyncPending,
    markCloudSyncSettled: state.markCloudSyncSettled,
    copyShareReviewToEditableVersion: state.copyShareReviewToEditableVersion,
    catalogYear: state.catalogYear,
    setCatalogYear: state.setCatalogYear,
    switchCatalogYear: state.switchCatalogYear,
  })));
  const specializationCatalog = getTrackSpecializationCatalog(trackDef.id, catalogYear);
  const specs = specializationCatalog.groups;
  const weightedAverage = useWeightedAverage(courses);
  const progress = useRequirementsProgress(courses, trackDef, specializationCatalog, weightedAverage);
  const degreeCompletion = useDegreeCompletionCheck(courses, trackDef, specializationCatalog, weightedAverage);

  const shareMode = useShareMode();
  const { user } = useAuth();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const lastLoadedUid = useRef<string | null>(null);
  const applyingCloudPlan = useRef(false);
  const cloudSyncReady = useRef(false);
  const suppressAutoInitCloudPending = useRef(false);
  const latestLocalSignature = useRef(getPlanSignature(extractEnvelope(usePlanStore.getState())));
  const lastSaveTime = useRef(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [shareSaveStatus, setShareSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest envelope received from the live share subscription. Used by the
  // owner's "accept changes" action to copy the current share state into
  // plans/{uid}. Stays in sync with what the user is actually looking at.
  const latestShareEnvelopeRef = useRef<VersionedPlanEnvelope | null>(null);
  // Holds a remote snapshot that arrived while a local debounce was in flight.
  // Applied after the PUT completes so we don't silently drop concurrent edits.
  const pendingRemoteSnapshotRef = useRef<import('./services/shareApi').ShareSnapshot | null>(null);
  const [pendingShareUpdates, setPendingShareUpdates] = useState<ShareSnapshot[]>([]);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCourseAdded = useCallback((courseName: string, semesterLabel: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message: `${courseName} נוסף ל${semesterLabel}`, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), TOAST_DURATION_MS);
  }, []);

  // Regular-app variant: accept a specific owned share's envelope into the
  // personal plan. Optimistically clears the indicator for that share.
  const handleAcceptOwnedShareUpdate = useCallback(async (snapshot: ShareSnapshot) => {
    if (!user || user.uid !== snapshot.ownerUid) return;
    await savePlanToCloud(user.uid, snapshot.envelope);
    setPendingShareUpdates((prev) => prev.filter((s) => s.shareId !== snapshot.shareId));
  }, [user]);

  useEffect(() => {
    reportTrackSpecializationDiagnostics(trackDef.id);
  }, [trackDef.id]);

  useEffect(() => {
    if (!user) {
      setSyncStatus('idle');
      return;
    }

    setSyncStatus((currentStatus) => {
      if (currentStatus === 'saving' || currentStatus === 'error') return currentStatus;
      return hasPendingCloudSync ? 'pending' : 'saved';
    });
  }, [user, hasPendingCloudSync]);

  useEffect(() => {
    if (!trackId) return;
    if (shareMode?.isShareReview) return;
    const initializedTrackKey = catalogYear ? `${trackId}:${catalogYear}` : trackId;

    suppressAutoInitCloudPending.current = true;
    try {
      const allPlaced = new Set(Object.values(semesters).flat());
      const alreadyInitialized = new Set<string>();
      const dismissedForTrack = new Set(dismissedRecommendedCourses?.[trackId] ?? []);
      for (const entry of trackDef.semesterSchedule) {
        const ids = getRecommendedCourseIdsForEntry(entry, courses, englishScore);
        for (const id of ids) {
          if (!allPlaced.has(id) && !alreadyInitialized.has(id) && !dismissedForTrack.has(id)) {
            addCourseToSemester(id, entry.semester);
            alreadyInitialized.add(id);
          }
        }
      }
      markTrackInitialized(initializedTrackKey);
    } finally {
      suppressAutoInitCloudPending.current = false;
    }
  }, [shareMode, trackId, catalogYear, semesters, trackDef.semesterSchedule, courses, addCourseToSemester, dismissedRecommendedCourses, englishScore, markTrackInitialized]);

  useEffect(() => {
    // Any share route is isolated from the owner's personal cloud document.
    if (shareMode) return;

    const unsubscribe = usePlanStore.subscribe((state, previousState) => {
      if (applyingCloudPlan.current) return;
      if (suppressAutoInitCloudPending.current) return;

      const currentSignature = getPlanSignature(extractEnvelope(state));
      const previousSignature = getPlanSignature(extractEnvelope(previousState));
      if (currentSignature === previousSignature) return;

      latestLocalSignature.current = currentSignature;
      markCloudSyncPending(Date.now());
      if (user) {
        setSyncStatus('pending');
        setSyncErrorMessage(null);
      }
    });

    return unsubscribe;
  }, [shareMode, markCloudSyncPending, user]);

  // Share edit sync: partners save edits to the share document only.
  useEffect(() => {
    if (!shareMode?.canEdit || shareMode.isOwner) return;
    const { shareId } = shareMode;

    const unsubscribe = usePlanStore.subscribe((state, previousState) => {
      if (applyingCloudPlan.current) return;
      const currentSig = getPlanSignature(extractEnvelope(state));
      const prevSig = getPlanSignature(extractEnvelope(previousState));
      if (currentSig === prevSig) return;

      if (shareTimer.current) clearTimeout(shareTimer.current);
      setShareSaveStatus('saving');
      shareTimer.current = window.setTimeout(async () => {
        shareTimer.current = null;
        try {
          const envelope = extractEnvelope(usePlanStore.getState(), Date.now());
          await updateSharedEnvelope(shareId, envelope);
          setShareSaveStatus('saved');
          window.setTimeout(() => setShareSaveStatus('idle'), 2000);
          // Apply any remote snapshot that arrived while the debounce was in
          // flight, so concurrent collaborator edits are not silently lost.
          const pending = pendingRemoteSnapshotRef.current;
          if (pending) {
            pendingRemoteSnapshotRef.current = null;
            const localSig = getPlanSignature(extractEnvelope(usePlanStore.getState()));
            if (localSig !== getPlanSignature(pending.envelope)) {
              applyingCloudPlan.current = true;
              try { loadEnvelope(pending.envelope); }
              finally { applyingCloudPlan.current = false; }
            }
          }
        } catch {
          setShareSaveStatus('error');
        }
      }, SAVE_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (shareTimer.current) clearTimeout(shareTimer.current);
    };
  }, [shareMode]);

  // Live share snapshot: mirror remote shares/{shareId} changes into the
  // local store so all participants see each other in real time.
  // - Partners: apply via loadEnvelope (they own the store in share mode).
  // - Owners (isShareReview): apply via loadShareReviewEnvelope so the
  //   personal plan is never overwritten.
  // Echo-loop guard: skip when a local debounce is in flight (shareTimer) or
  // the signatures already match; apply under applyingCloudPlan so the
  // share-edit subscription doesn't echo it back as a PUT.
  useEffect(() => {
    if (!shareMode) return;
    const { shareId, isShareReview } = shareMode;

    function applySnapshot(snapshot: import('./services/shareApi').ShareSnapshot) {
      latestShareEnvelopeRef.current = snapshot.envelope;
      if (isShareReview) {
        const current = usePlanStore.getState().shareReview;
        const currentSig = current ? getPlanSignature(current.envelope) : '';
        if (currentSig === getPlanSignature(snapshot.envelope)) return;
        applyingCloudPlan.current = true;
        try {
          usePlanStore.getState().loadShareReviewEnvelope(
            shareId, snapshot.updatedAt, snapshot.envelope, true,
          );
        } finally {
          applyingCloudPlan.current = false;
        }
      } else {
        const localSig = getPlanSignature(extractEnvelope(usePlanStore.getState()));
        if (localSig === getPlanSignature(snapshot.envelope)) return;
        applyingCloudPlan.current = true;
        try {
          loadEnvelope(snapshot.envelope);
        } finally {
          applyingCloudPlan.current = false;
        }
      }
    }

    const unsubscribe = subscribeToShare(
      shareId,
      (snapshot) => {
        latestShareEnvelopeRef.current = snapshot.envelope;
        if (shareTimer.current) {
          // Local edit is debouncing — park the remote snapshot and apply it
          // after the PUT completes so we don't lose concurrent edits.
          pendingRemoteSnapshotRef.current = snapshot;
          return;
        }
        pendingRemoteSnapshotRef.current = null;
        applySnapshot(snapshot);
      },
      (error) => {
        console.warn('[shareSync] subscribeToShare error:', error);
      },
    );

    return () => {
      unsubscribe();
      latestShareEnvelopeRef.current = null;
      pendingRemoteSnapshotRef.current = null;
    };
  }, [shareMode, loadEnvelope]);

  // Owner-only: while in the regular app (not in share mode), watch the
  // shares this user owns so we can surface "there are pending updates from
  // a collaborator" hints. Updates are NEVER auto-applied — the owner must
  // explicitly accept them via ExportShareModal.
  useEffect(() => {
    if (shareMode || !user) {
      setPendingShareUpdates([]);
      return;
    }
    const unsubscribe = subscribeToMyShares(
      user.uid,
      (shares) => {
        const localSig = getPlanSignature(extractEnvelope(usePlanStore.getState()));
        setPendingShareUpdates(
          shares.filter((s) => getPlanSignature(s.envelope) !== localSig),
        );
      },
      (error) => {
        console.warn('[shareSync] subscribeToMyShares error:', error);
      },
    );
    return unsubscribe;
  }, [shareMode, user]);

  useEffect(() => {
    // Any share route is isolated from the owner's personal cloud document.
    if (shareMode) return;

    const clearSyncTimers = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };

    if (isSwitchingTrack && !trackId) {
      lastLoadedUid.current = null;
      clearSyncTimers();
      return;
    }

    if (!user) {
      if (lastLoadedUid.current !== null) {
        applyingCloudPlan.current = true;
        resetPlan();
        latestLocalSignature.current = getPlanSignature(extractEnvelope(usePlanStore.getState()));
        applyingCloudPlan.current = false;
      }
      lastLoadedUid.current = null;
      clearSyncTimers();
      return;
    }

    if (lastLoadedUid.current && lastLoadedUid.current !== user.uid) {
      applyingCloudPlan.current = true;
      resetPlan();
      latestLocalSignature.current = getPlanSignature(extractEnvelope(usePlanStore.getState()));
      applyingCloudPlan.current = false;
    }

    lastLoadedUid.current = user.uid;
    const uid = user.uid;

    const scheduleRetrySave = (delay = SYNC_RETRY_DELAY_MS, onSuccess?: () => void) => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        void doSave(onSuccess);
      }, delay);
    };

    const handleSaveError = (error: unknown, onSuccess?: () => void) => {
      const message = error instanceof Error ? error.message : 'שגיאת שמירה';
      if (isRetryableSyncError(error)) {
        setSyncStatus('error');
        setSyncErrorMessage(`${message}. ננסה שוב אוטומטית.`);
        scheduleRetrySave(SYNC_RETRY_DELAY_MS, onSuccess);
        return;
      }

      setSyncStatus('error');
      setSyncErrorMessage(message);
    };

    const doSave = async (onSuccess?: () => void) => {
      if (isSavingRef.current) return;
      // Never write to Firestore before we've received the first cloud snapshot.
      // Prevents overwriting cloud data with auto-initialized local state.
      if (!cloudSyncReady.current) return;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      const localState = usePlanStore.getState();
      const saveTimestamp = Math.max(localState.lastLocalEditAt ?? 0, Date.now());
      const localEnvelope = extractEnvelope(localState, saveTimestamp);

      isSavingRef.current = true;
      setSyncStatus('saving');
      setSyncErrorMessage(null);
      lastSaveTime.current = Date.now();
      latestLocalSignature.current = getPlanSignature(localEnvelope);

      try {
        await savePlanToCloud(uid, localEnvelope);
        setSyncErrorMessage(null);
        const currentState = usePlanStore.getState();
        if ((currentState.lastLocalEditAt ?? 0) <= saveTimestamp) {
          applyingCloudPlan.current = true;
          currentState.markCloudSyncSettled(saveTimestamp);
          latestLocalSignature.current = getPlanSignature(extractEnvelope(usePlanStore.getState()));
          applyingCloudPlan.current = false;
          setSyncStatus('saved');
          onSuccess?.();
        } else {
          setSyncStatus('pending');
          scheduleRetrySave(SAVE_DEBOUNCE_MS, onSuccess);
        }
      } catch (error: unknown) {
        handleSaveError(error, onSuccess);
      } finally {
        isSavingRef.current = false;
      }
    };

    const handleCloudEnvelope = (cloudEnvelope: VersionedPlanEnvelope) => {
      cloudSyncReady.current = true;
      const localState = usePlanStore.getState();
      const localEnvelope = extractEnvelope(localState);
      const localSignature = getPlanSignature(localEnvelope);
      const cloudSignature = getPlanSignature(cloudEnvelope);

      if (cloudSignature === localSignature) {
        latestLocalSignature.current = localSignature;
        if (localState.hasPendingCloudSync) {
          applyingCloudPlan.current = true;
          localState.markCloudSyncSettled();
          applyingCloudPlan.current = false;
        }
        setSyncStatus('saved');
        setSyncErrorMessage(null);
        return;
      }

      if (shouldApplyCloudEnvelope(localEnvelope, cloudEnvelope, localState.hasPendingCloudSync)) {
        applyingCloudPlan.current = true;
        loadEnvelope(cloudEnvelope);
        latestLocalSignature.current = cloudSignature;
        applyingCloudPlan.current = false;
        setSyncStatus('saved');
        setSyncErrorMessage(null);
        return;
      }

      latestLocalSignature.current = localSignature;
      if (localState.hasPendingCloudSync) {
        setSyncStatus('pending');
        setSyncErrorMessage(null);
        void doSave();
      }
    };

    const unsubSnapshot = subscribeToCloudPlan(
      uid,
      handleCloudEnvelope,
      () => {
        cloudSyncReady.current = true;
        void doSave();
      },
      (error) => {
        if (isRetryableSyncError(error)) return;
        setSyncStatus('error');
        setSyncErrorMessage(error.message);
      },
    );

    const unsubStore = usePlanStore.subscribe((state, previousState) => {
      if (applyingCloudPlan.current) return;
      const currentSignature = getPlanSignature(extractEnvelope(state));
      const previousSignature = getPlanSignature(extractEnvelope(previousState));
      if (currentSignature === previousSignature) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void doSave(isSwitchingTrack ? finishTrackSwitch : undefined);
      }, isSwitchingTrack ? TRACK_SWITCH_DEBOUNCE_MS : SAVE_DEBOUNCE_MS);
    });

    if (isSwitchingTrack) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void doSave(finishTrackSwitch);
      }, TRACK_SWITCH_DEBOUNCE_MS);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && saveTimer.current) {
        void doSave();
      }
    };

    const handleOnline = () => {
      void doSave();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      cloudSyncReady.current = false;
      unsubSnapshot();
      unsubStore();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      clearSyncTimers();
    };
  }, [shareMode, user, trackId, loadEnvelope, resetPlan, finishTrackSwitch, isSwitchingTrack, markCloudSyncSettled]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === 'z')) return;
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if ((e.target as HTMLElement).isContentEditable) return;
      if (_history.length === 0) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [_history.length, undo]);

  const [showCompare, setShowCompare] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showDegreeCheck, setShowDegreeCheck] = useState(false);
  const [printOptions, setPrintOptions] = useState<{
    includeGrades: boolean;
    versionIds: string[];
  } | null>(null);

  function handlePrint(opts: { includeGrades: boolean; versionIds: string[] }) {
    setPrintOptions(opts);
    setTimeout(() => window.print(), 100);
  }

  function showToast(message: string) {
    setToast({ message, visible: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), TOAST_DURATION_MS);
  }

  function handleResetToDefault() {
    if (window.confirm('האם לאפס את המערכת למומלצת? כל השינויים שלך יימחקו.')) {
      resetToDefault();
    }
  }

  function handleCopyShareReview() {
    const result = copyShareReviewToEditableVersion();
    if (!result.ok) {
      showToast(result.reason === 'capacity_full'
        ? 'אי אפשר ליצור עותק: הגעת למגבלת הגרסאות הפנימית'
        : 'לא נמצאה גרסת שיתוף להעתקה');
      return;
    }

    showToast('נוצר עותק לעריכה מהשיתוף');
    window.location.hash = '';
  }

  return (
    <>
    <div className="app-bg">
      <Toast message={toast.message} visible={toast.visible} />
      {showCompare && (
        <VersionCompareModal
          versions={versions ?? []}
          courses={courses}
          trackDefs={ALL_TRACKS}
          onClose={() => setShowCompare(false)}
        />
      )}
      {showExport && (
        <ExportShareModal
          onClose={() => setShowExport(false)}
          onPrint={handlePrint}
          courses={courses}
          trackDef={trackDef}
          catalog={specializationCatalog}
          pendingShareUpdates={pendingShareUpdates}
          onAcceptShareUpdate={handleAcceptOwnedShareUpdate}
        />
      )}
      {shareMode && (
        <div
          className={`sticky top-0 z-20 px-4 py-2 text-xs text-center flex flex-wrap items-center justify-center gap-3 ${
            shareMode.isShareReview
              ? 'bg-indigo-50 border-b border-indigo-200 text-indigo-800'
              : shareMode.canEdit
                ? 'bg-amber-50 border-b border-amber-200 text-amber-800'
                : 'bg-blue-50 border-b border-blue-200 text-blue-800'
          }`}
          dir="rtl"
        >
          {shareMode.isShareReview && (
            <>
              <span className="font-semibold">
                גרסת שיתוף לבדיקה{shareMode.isNewShareReview ? ' · עדכון חדש' : ''}
              </span>
              <span>
                אתה צופה בגרסת שיתוף לבדיקה. אי אפשר לערוך אותה ישירות. כדי לעבוד עליה, צור עותק לעריכה.
              </span>
              <button
                onClick={handleCopyShareReview}
                className="rounded-lg border border-indigo-300 bg-white px-3 py-1 font-medium text-indigo-700 hover:border-indigo-500 hover:text-indigo-900 transition-colors"
              >
                צור עותק לעריכה
              </button>
            </>
          )}
          {!shareMode.isShareReview && (
            <>
          <span>
            {shareMode.canEdit
              ? '⚠ אתה צופה בתוכנית משותפת במצב עריכה. שינויים ישמרו ישירות על הגרסה המשותפת.'
              : '👁 אתה צופה בתוכנית משותפת (צפייה בלבד). שינויים שתבצע לא יישמרו.'}
            {shareMode.share.ownerEmail && ` שותפה על ידי ${shareMode.share.ownerEmail}.`}
          </span>
          {shareMode.canEdit && shareSaveStatus !== 'idle' && (
            <span className={shareSaveStatus === 'error' ? 'text-red-600' : shareSaveStatus === 'saved' ? 'text-emerald-700' : 'text-amber-600'}>
              {shareSaveStatus === 'saving' ? 'שומר...' : shareSaveStatus === 'saved' ? '✓ נשמר' : 'שגיאה בשמירה'}
            </span>
          )}
          {shareMode.canEdit && !shareMode.isOwner && (
            <span className="text-amber-600">
              כדי לעבוד על עותק נפרד,{' '}
              <a href={window.location.origin} className="underline hover:text-amber-900">פתח את המתכנן שלך</a>.
            </span>
          )}
            </>
          )}
          <a href={window.location.origin} className="underline font-medium hover:opacity-80">עבור לתוכנית שלי</a>
        </div>
      )}
      <header className="app-header sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-5 py-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">מתכנן לימודים – הטכניון</h1>
              <p className="text-sm font-light" style={{ color: 'rgba(147,197,253,0.8)' }}>{trackDef.name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden text-sm border px-2 py-1.5 rounded-lg transition-colors"
                style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.2)' }}
                aria-label="פתח תפריט"
                aria-expanded={sidebarOpen}
                aria-controls="sidebar-drawer"
              >☰</button>
              {(!shareMode || shareMode.isOwner) && <LoginButton syncStatus={syncStatus} syncErrorMessage={syncErrorMessage} />}
              {(!shareMode || shareMode.isOwner) && (
                <button
                  onClick={() => setShowExport(true)}
                  className="relative text-sm font-medium text-white bg-white/15 hover:bg-white/25 border border-white/25 hover:border-white/50 px-3 py-1.5 rounded-lg transition-colors"
                  title={pendingShareUpdates.length > 0
                    ? `יש ${pendingShareUpdates.length} עדכון מהשיתוף ממתינים לאישור`
                    : 'ייצוא, שיתוף, או ייבוא של המערכת'}
                >
                  <span>⇪</span><span className="hidden sm:inline"> שיתוף</span>
                  {pendingShareUpdates.length > 0 && (
                    <span
                      className="absolute -top-1 -left-1 min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center rounded-full bg-emerald-400 text-white text-[10px] font-bold shadow"
                      aria-label={`${pendingShareUpdates.length} עדכוני שיתוף ממתינים`}
                    >
                      {pendingShareUpdates.length}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={undo}
                disabled={_history.length === 0}
                className="text-sm border px-3 py-1.5 rounded-lg transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                style={{ color: 'rgba(255,255,255,0.65)', borderColor: 'rgba(255,255,255,0.18)' }}
                title={_history.length > 0 ? `בטל פעולה אחרונה (${_history.length})` : 'אין פעולות לביטול'}
              >
                <span>↩</span><span className="hidden sm:inline"> בטל</span>
              </button>
              <button
                onClick={handleResetToDefault}
                className="text-sm border px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'rgba(252,211,77,0.9)', borderColor: 'rgba(252,211,77,0.35)' }}
                title="החזר את המערכת לתכנית הלימודים המומלצת"
              >
                <span>⟳</span><span className="hidden sm:inline"> מומלצת</span>
              </button>
              <button
                onClick={() => setShowDegreeCheck(true)}
                className={`text-sm border px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  degreeCompletion?.result.isComplete
                    ? 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10'
                    : 'text-violet-300 border-violet-400/40 hover:bg-violet-400/10'
                }`}
                title="בדיקת גמר תואר והמלצות"
              >
                <span className="hidden sm:inline">
                  {degreeCompletion?.result.isComplete ? '✓ גמר תואר' : 'גמר תואר'}
                </span>
                <span className="sm:hidden">
                  {degreeCompletion?.result.isComplete ? '✓' : '🎓'}
                </span>
              </button>
              {availableYears.length > 0 && (
                <select
                  value={catalogYear ?? availableYears[0]}
                  onChange={(e) => switchCatalogYear(Number(e.target.value), getAllScheduledCourseIds(trackDef))}
                  className="text-sm border px-2 py-1.5 rounded-lg bg-transparent cursor-pointer"
                  style={{ color: 'rgba(147,197,253,0.9)', borderColor: 'rgba(147,197,253,0.3)' }}
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y} style={{ background: '#1e3a5f' }}>
                      {y}/{String(y + 1).slice(-2)}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={beginTrackSwitch}
                className="text-sm border px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'rgba(252,165,165,0.9)', borderColor: 'rgba(252,165,165,0.3)' }}
              >
                <span className="hidden sm:inline">החלף מסלול</span><span className="sm:hidden">מסלול</span>
              </button>
            </div>
          </div>
          <VersionTabs onCompare={() => setShowCompare(true)} />
        </div>
      </header>
      <main className="max-w-screen-2xl mx-auto px-3 sm:px-4 py-5 md:py-6">
        <div className="flex flex-col md:flex-row md:gap-5">
          {/* Desktop sidebar — hidden on mobile */}
          <aside className="hidden md:flex md:w-64 shrink-0 flex-col gap-3.5 sticky top-20 self-start max-h-[calc(100vh-5rem)] overflow-y-auto">
            <RequirementsPanel progress={progress} weightedAverage={weightedAverage} />
            <SpecializationPanel catalog={specializationCatalog} courses={courses} />
            <ChainRecommendations catalog={specializationCatalog} courses={courses} trackDef={trackDef} />
          </aside>

          {/* Mobile drawer — md:hidden enforced inside component */}
          <MobileSidebarDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
            <RequirementsPanel progress={progress} weightedAverage={weightedAverage} />
            <SpecializationPanel catalog={specializationCatalog} courses={courses} />
            <ChainRecommendations catalog={specializationCatalog} courses={courses} trackDef={trackDef} />
          </MobileSidebarDrawer>

          <div className="flex-1 min-w-0">
            <CourseSearch courses={courses} onCourseAdded={handleCourseAdded} />
            <SemesterGrid courses={courses} trackDef={trackDef} specializations={specs} />
          </div>
        </div>
      </main>
    </div>
    <PrintView
      courses={courses}
      trackDef={trackDef}
      catalog={specializationCatalog}
      includeGrades={printOptions?.includeGrades ?? true}
      versionIds={printOptions?.versionIds}
    />
    <DegreeCompletionModal
      open={showDegreeCheck}
      onClose={() => setShowDegreeCheck(false)}
      data={degreeCompletion}
    />
    </>
  );
}

function AppInner() {
  const [courses, setCourses] = useState<Map<string, SapCourse>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trackId = usePlanStore((s) => s.trackId);
  const catalogYear = usePlanStore((s) => s.catalogYear);
  const setCatalogYear = usePlanStore((s) => s.setCatalogYear);
  const isSwitchingTrack = usePlanStore((s) => s.isSwitchingTrack);
  const hasPendingCloudSync = usePlanStore((s) => s.hasPendingCloudSync);
  const loadEnvelope = usePlanStore((s) => s.loadEnvelope);
  const { user, loading: authLoading } = useAuth();
  const shareMode = useShareMode();

  // Default to newest year for tracks with yearVariants when catalogYear is not set
  // (handles old persisted plans that pre-date year selection)
  useEffect(() => {
    if (!trackId || catalogYear !== null) return;
    const trackDef = ALL_TRACKS.find((t) => t.id === trackId);
    if (!trackDef) return;
    const years = getAvailableYears(trackDef);
    if (years.length > 0) setCatalogYear(years[0]);
  }, [trackId, catalogYear, setCatalogYear]);

  useEffect(() => {
    fetchCourses()
      .then((loadedCourses) => {
        setCourses(loadedCourses);
        reportMissingStaticCourseReferences(
          ALL_TRACKS,
          loadedCourses,
          (track, year) => getTrackSpecializationCatalog(track.id, year),
        );
      })
      .catch((e) => {
        console.error(e);
        setError('שגיאה בטעינת נתוני הקורסים. אנא בדוק את חיבור האינטרנט.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (shareMode) return;
    if (!user || trackId || isSwitchingTrack) return;

    return subscribeToCloudPlan(
      user.uid,
      (cloudEnvelope) => {
        const localState = usePlanStore.getState();
        const localEnvelope = extractEnvelope(localState);
        if (getPlanSignature(localEnvelope) === getPlanSignature(cloudEnvelope)) {
          return;
        }

        if (shouldApplyCloudEnvelope(localEnvelope, cloudEnvelope, hasPendingCloudSync)) {
          loadEnvelope(cloudEnvelope);
        }
      },
      () => undefined,
    );
  }, [shareMode, user, trackId, isSwitchingTrack, loadEnvelope, hasPendingCloudSync]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600">טוען נתוני קורסים...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-xl shadow border border-red-200 max-w-md text-center">
          <p className="text-red-600 font-semibold mb-2">⚠️ שגיאה בטעינה</p>
          <p className="text-gray-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!trackId) return <TrackSelector tracks={ALL_TRACKS} />;

  const trackDef = ALL_TRACKS.find((t) => t.id === trackId);
  if (!trackDef) return null;

  const availableYears = getAvailableYears(trackDef);
  const resolvedTrackDef = resolveTrackForYear(trackDef, catalogYear);
  return <PlannerApp courses={courses} trackDef={resolvedTrackDef} availableYears={availableYears} />;
}

export default function App() {
  return <AppInner />;
}

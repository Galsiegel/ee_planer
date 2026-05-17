import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function transpileToModuleUrl(source) {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
}

async function loadSerializerModule() {
  const source = readFileSync(join(repoRoot, 'src', 'services', 'planStateSerialization.ts'), 'utf8');
  return import(transpileToModuleUrl(source));
}

async function loadPlanSyncModule(serializerModuleUrl) {
  const source = readFileSync(join(repoRoot, 'src', 'services', 'planSync.ts'), 'utf8')
    .replace("'./planStateSerialization'", `'${serializerModuleUrl}'`)
    .replace('"./planStateSerialization"', `"${serializerModuleUrl}"`);

  return import(transpileToModuleUrl(source));
}

const serializerModuleUrl = transpileToModuleUrl(
  readFileSync(join(repoRoot, 'src', 'services', 'planStateSerialization.ts'), 'utf8'),
);
const { serializePlanState } = await loadSerializerModule();
const {
  buildEnvelopeFromState,
  getPlanSignature,
  shouldApplyCloudEnvelope,
} = await loadPlanSyncModule(serializerModuleUrl);

function createPlan(overrides = {}) {
  return {
    trackId: 'ee',
    semesters: { 0: [], 1: ['02340117'], 2: [] },
    completedCourses: ['02340117'],
    selectedSpecializations: ['spec-secondary'],
    favorites: ['02340117'],
    grades: { '02340117': 91 },
    substitutions: { '02340117': '02340118' },
    maxSemester: 8,
    selectedPrereqGroups: { '02340117': ['104031', '104032'] },
    summerSemesters: [],
    currentSemester: 2,
    semesterOrder: [1, 2, 3, 4, 5, 6, 7, 8],
    semesterTypeOverrides: { 2: 'spring' },
    semesterWarningsIgnored: [2],
    doubleSpecializations: ['spec-secondary'],
    hasEnglishExemption: false,
    manualSapAverages: { '02340117': 88 },
    binaryPass: {},
    completedInstances: ['02340117__1__0'],
    savedTracks: {
      cs: {
        trackId: 'cs',
        semesters: { 0: [], 1: ['02340119'] },
        completedCourses: [],
        selectedSpecializations: ['spec-cs'],
        favorites: [],
        grades: {},
        substitutions: {},
        maxSemester: 8,
        selectedPrereqGroups: {},
        summerSemesters: [],
        currentSemester: null,
        semesterOrder: [1, 2, 3, 4, 5, 6, 7, 8],
        semesterTypeOverrides: {},
        semesterWarningsIgnored: [],
        doubleSpecializations: [],
        hasEnglishExemption: false,
        manualSapAverages: {},
        binaryPass: {},
        completedInstances: [],
        dismissedRecommendedCourses: {},
        facultyColorOverrides: {},
        coreToChainOverrides: [],
        roboticsMinorEnabled: false,
        entrepreneurshipMinorEnabled: false,
        quantumComputingMinorEnabled: false,
        initializedTracks: ['cs'],
      },
    },
    miluimCredits: 2,
    englishScore: 120,
    englishTaughtCourses: ['02340117'],
    dismissedRecommendedCourses: { ee: ['02340200'] },
    facultyColorOverrides: { math: 'blue' },
    coreToChainOverrides: ['02340117'],
    roboticsMinorEnabled: true,
    entrepreneurshipMinorEnabled: true,
    quantumComputingMinorEnabled: true,
    initializedTracks: ['ee'],
    ...overrides,
  };
}

function createEnvelope(updatedAt, overrides = {}) {
  const plan = createPlan(overrides.plan);
  return {
    schemaVersion: 2,
    versions: [{
      id: overrides.versionId ?? 'version-1',
      name: overrides.versionName ?? 'גרסה 1',
      plan,
      createdAt: updatedAt,
      updatedAt,
    }],
    activeVersionId: overrides.versionId ?? 'version-1',
  };
}

test('serializePlanState preserves saved tracks, initialized tracks, and specialization choices', () => {
  const serialized = serializePlanState(createPlan());

  assert.deepEqual(serialized.selectedSpecializations, ['spec-secondary']);
  assert.deepEqual(serialized.doubleSpecializations, ['spec-secondary']);
  assert.deepEqual(serialized.initializedTracks, ['ee']);
  assert.equal(serialized.quantumComputingMinorEnabled, true);
  assert.ok(serialized.savedTracks?.cs, 'savedTracks should be preserved in serialized plans');
  assert.deepEqual(serialized.savedTracks.cs.selectedSpecializations, ['spec-cs']);
});

test('buildEnvelopeFromState writes current active-plan fields into the envelope', () => {
  const stateLike = {
    ...createPlan({
      selectedSpecializations: ['spec-secondary'],
      doubleSpecializations: ['spec-secondary'],
      initializedTracks: ['ee'],
    }),
    versions: [{
      id: 'version-1',
      name: 'גרסה 1',
      plan: createPlan({ selectedSpecializations: [], doubleSpecializations: [], initializedTracks: [] }),
      createdAt: 10,
      updatedAt: 10,
    }],
    activeVersionId: 'version-1',
  };

  const envelope = buildEnvelopeFromState(stateLike);

  assert.deepEqual(envelope.versions[0].plan.selectedSpecializations, ['spec-secondary']);
  assert.deepEqual(envelope.versions[0].plan.doubleSpecializations, ['spec-secondary']);
  assert.deepEqual(envelope.versions[0].plan.initializedTracks, ['ee']);
  assert.ok(envelope.versions[0].plan.savedTracks?.cs, 'savedTracks should be included in active version snapshots');
});

test('shouldApplyCloudEnvelope prefers cloud whenever local has no pending changes', () => {
  const localEnvelope = createEnvelope(100);
  const newerCloudEnvelope = createEnvelope(200, { versionId: 'version-2' });
  const olderCloudEnvelope = createEnvelope(50, { versionId: 'version-3' });

  assert.equal(shouldApplyCloudEnvelope(localEnvelope, localEnvelope, false), false, 'equal envelopes should not reapply cloud');
  assert.equal(shouldApplyCloudEnvelope(localEnvelope, newerCloudEnvelope, false), true, 'cloud wins when local is not pending');
  assert.equal(shouldApplyCloudEnvelope(localEnvelope, olderCloudEnvelope, false), true, 'cloud wins regardless of freshness when local is not pending — Date.now() on fresh devices makes local falsely look newer');
  assert.equal(shouldApplyCloudEnvelope(localEnvelope, olderCloudEnvelope, true), false, 'pending local data should never be overwritten by cloud');
  assert.equal(shouldApplyCloudEnvelope(localEnvelope, newerCloudEnvelope, true), false, 'pending local data should never be overwritten by cloud even if cloud is newer');
});

test('plan store snapshots stay aligned with the shared serializer', () => {
  const planStoreSource = readFileSync(join(repoRoot, 'src', 'store', 'planStore.ts'), 'utf8');

  assert.match(
    planStoreSource,
    /function captureSnapshot\(state: PlanState\): StudentPlan {\s*return serializePlanState\(state\);/s,
    'captureSnapshot should delegate to the shared serializer so savedTracks and initializedTracks stay aligned',
  );
});

test('App sync logic uses the shared envelope helpers instead of ad-hoc serialization', () => {
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8');

  assert.match(appSource, /buildEnvelopeFromState/, 'App should build cloud payloads through the shared envelope helper');
  assert.match(appSource, /shouldApplyCloudEnvelope/, 'App should decide cloud overwrite using the freshness helper');
  assert.match(appSource, /markCloudSyncPending/, 'App should persist explicit pending-sync metadata for local edits');
  assert.match(appSource, /markCloudSyncSettled/, 'App should clear pending-sync metadata after confirmed sync');
  assert.doesNotMatch(
    appSource,
    /if \(\(initializedTracks \?\? \[\]\)\.includes/,
    'App should reconcile missing recommended courses even for already-initialized local plans',
  );
  assert.match(
    appSource,
    /const suppressAutoInitCloudPending = useRef\(false\);/,
    'App should track auto-initialization separately from real user edits',
  );
  assert.match(
    appSource,
    /if \(suppressAutoInitCloudPending\.current\) return;/,
    'App should suppress pending-sync marking only while auto-seeding recommended courses',
  );
  assert.match(
    appSource,
    /suppressAutoInitCloudPending\.current = true;[\s\S]*markTrackInitialized\([^)]*\);[\s\S]*suppressAutoInitCloudPending\.current = false;/,
    'App should bracket track auto-initialization so recommended seeding does not look like a user edit',
  );
  assert.match(
    appSource,
    /\(\) => {\s*cloudSyncReady\.current = true;\s*void doSave\(\);\s*}/,
    'App should permit the first cloud save when the remote plan document is absent',
  );
  assert.doesNotMatch(
    appSource,
    /if \(lastLoadedUid\.current === user\.uid\) return;/,
    'App must resubscribe for the same user after track/switching dependency cleanup so cloudSyncReady can be restored',
  );
  assert.notEqual(getPlanSignature(localEnvelopeForSignatureCheck()), '', 'plan signatures should be non-empty for sync comparisons');
});

function localEnvelopeForSignatureCheck() {
  return buildEnvelopeFromState({
    ...createPlan(),
    versions: [{
      id: 'version-signature',
      name: 'גרסה חתימה',
      plan: createPlan(),
      createdAt: 1,
      updatedAt: 1,
    }],
    activeVersionId: 'version-signature',
  });
}

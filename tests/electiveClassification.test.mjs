import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const transpiledModuleUrls = new Map();

function resolveTypeScriptModule(fromDir, specifier) {
  const basePath = resolve(fromDir, specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    join(basePath, 'index.ts'),
    join(basePath, 'index.tsx'),
  ];

  const resolvedPath = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!resolvedPath) {
    throw new Error(`Unable to resolve module "${specifier}" from ${fromDir}`);
  }

  return resolvedPath;
}

function transpileToDataUrl(absolutePath) {
  const cached = transpiledModuleUrls.get(absolutePath);
  if (cached) return cached;

  const source = readFileSync(absolutePath, 'utf8');
  let transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  if (transpiled.includes('import.meta.glob')) {
    transpiled = `const __importMetaGlob = () => ({});\n${transpiled.replaceAll('import.meta.glob', '__importMetaGlob')}`;
  }

  const specifiers = [...transpiled.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);

  for (const specifier of new Set(specifiers)) {
    if (specifier.startsWith('node:')) continue;
    const dependencyUrl = specifier.startsWith('.')
      ? transpileToDataUrl(resolveTypeScriptModule(dirname(absolutePath), specifier))
      : import.meta.resolve(specifier);
    transpiled = transpiled
      .replaceAll(`'${specifier}'`, `'${dependencyUrl}'`)
      .replaceAll(`"${specifier}"`, `"${dependencyUrl}"`);
  }

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
  transpiledModuleUrls.set(absolutePath, moduleUrl);
  return moduleUrl;
}

function loadTranspiledModule(relativePath) {
  const absolutePath = join(repoRoot, ...relativePath.split('/'));
  return import(transpileToDataUrl(absolutePath));
}

const { computeRequirementsProgress } = await loadTranspiledModule('src/hooks/usePlan.ts');
const { resolveTrackForYear } = await loadTranspiledModule('src/domain/resolveTrack.ts');
const { buildTrackSpecializationCatalogs } = await loadTranspiledModule('src/domain/specializations/engine.ts');
const { eeTrack } = await loadTranspiledModule('src/data/tracks/ee.ts');
const { csTrack } = await loadTranspiledModule('src/data/tracks/cs.ts');
const { eePhysicsTrack } = await loadTranspiledModule('src/data/tracks/ee_physics.ts');
const { eeCombinedTrack } = await loadTranspiledModule('src/data/tracks/ee_combined.ts');
const { eeMathTrack } = await loadTranspiledModule('src/data/tracks/ee_math.ts');
const { ceTrack } = await loadTranspiledModule('src/data/tracks/ce.ts');
const { computeQuantumComputingMinorProgress } = await loadTranspiledModule('src/hooks/useQuantumComputingMinor.ts');
const { sanitizeStudentPlan } = await loadTranspiledModule('src/services/planValidation.ts');

const filesRoot = join(repoRoot, 'files', 'קבוצות התמחות');
const TRACK_SPECIALIZATION_FOLDERS = {
  ee: 'מסלול הנדסת חשמל',
  cs: 'מסלול הנדסת מחשבים ותוכנה',
  ee_math: 'מסלול הנדסת חשמל ומתמטיקה',
  ee_physics: 'מסלול הנדסת חשמל ופיזיקה',
  ee_combined: 'מסלול משולב-חשמל-פיסיקה(178 נקז)',
  ce: 'מסלול הנדסת מחשבים',
};

function course(id, credits, faculty = '') {
  return {
    id,
    name: `Course ${id}`,
    credits,
    prerequisites: [],
    faculty,
  };
}

function namedCourse(id, name, credits, extra = {}) {
  return {
    id,
    name,
    credits,
    prerequisites: [],
    faculty: '',
    ...extra,
  };
}

const EE_MATH_LAB_IDS = ['00450100', '00450101', '00450102'];

const courses = new Map([
  ['00460001', course('00460001', 18)],
  ['00460002', course('00460002', 22)],
  ['00460010', course('00460010', 3)],
  ['00460195', course('00460195', 3)],
  ['00460202', course('00460202', 3)],
  ['01040000', course('01040000', 3.5)],
  ['01040293', course('01040293', 5)],
  ['01160210', course('01160210', 5)],
  ['00940312', course('00940312', 4)],
  ['00960570', course('00960570', 4)],
  ['00970317', course('00970317', 4)],
  ['01240120', course('01240120', 5)],
  ['03360504', course('03360504', 3.5)],
  ['00214119', course('00214119', 2)],
  ['03940810', course('03940810', 1.5)],
  ...EE_MATH_LAB_IDS.map((id) => [id, course(id, 1)]),
]);

const EE_COMBINED_ELECTRODYNAMICS_ID = '01140246';
const EE_COMBINED_FIELDS_ID = '00440140';
const EE_COMBINED_LAB_IDS = ['00450100', '00450101', '00450102'];

const eeCombinedMandatoryCourses = new Map([
  ['00440102', course('00440102', 0)],
  ['01040012', course('01040012', 5.5)],
  ['01140020', course('01140020', 1.5)],
  ['01140074', course('01140074', 5)],
  ['02340117', course('02340117', 4)],
  ['03240033', course('03240033', 3)],
  ['01040064', course('01040064', 5)],
  ['00440252', course('00440252', 5)],
  ['01040013', course('01040013', 5.5)],
  ['01040038', course('01040038', 2.5)],
  ['01040136', course('01040136', 4)],
  ['01140030', course('01140030', 1)],
  ['01140076', course('01140076', 5)],
  ['00440105', course('00440105', 4)],
  ['00440268', course('00440268', 3)],
  ['01040034', course('01040034', 3.5)],
  ['01040214', course('01040214', 2.5)],
  ['01040215', course('01040215', 2.5)],
  ['01040220', course('01040220', 2.5)],
  ['01140101', course('01140101', 4)],
  ['00440127', course('00440127', 3.5)],
  ['00440131', course('00440131', 5)],
  ['00440157', course('00440157', 2)],
  ['01150203', course('01150203', 5)],
  ['01140036', course('01140036', 5)],
  [EE_COMBINED_ELECTRODYNAMICS_ID, course(EE_COMBINED_ELECTRODYNAMICS_ID, 5)],
  [EE_COMBINED_FIELDS_ID, course(EE_COMBINED_FIELDS_ID, 3.5)],
  ['00440137', course('00440137', 5)],
  ['00440148', course('00440148', 3)],
  ['00440202', course('00440202', 3)],
  ['01150204', course('01150204', 5)],
  ['01160217', course('01160217', 3.5)],
  ['00440158', course('00440158', 1.5)],
  ['00440167', course('00440167', 4)],
  ['01140035', course('01140035', 1.5)],
  ['00440169', course('00440169', 4)],
  ['01140037', course('01140037', 1.5)],
  ['01240108', course('01240108', 3.5)],
  ['01140250', course('01140250', 3)],
  ['01140252', course('01140252', 3)],
  ...EE_COMBINED_LAB_IDS.map((id) => [id, course(id, 1)]),
]);

const CE_PROJECT_A_ID = '00440167';
const CE_PROJECT_B_ID = '00440169';
const CE_CS_PROJECT_1_ID = '02340001';
const CE_CS_PROJECT_2_ID = '02360001';
const ceBaseMandatoryIds = [
  '00440102', '01040012', '01040064', '02340129', '01140071', '02340114',
  '01040013', '02340125', '01040136', '01140075', '00440252',
  '02340124', '02340141', '00440105', '01040220', '01040215', '01040214', '03240033',
  '00440131', '01040034', '00440127', '02340218', '02340118', '01140073',
  '00440137', '00440157', '02340123', '01040134', '02340247', '00460267',
];
const ceMandatoryCourses = new Map([
  ['00440102', course('00440102', 0)],
  ['01040012', course('01040012', 5.5)],
  ['01040064', { ...course('01040064', 5), noAdditionalCreditIds: ['01040016'] }],
  ['01040016', { ...course('01040016', 5), noAdditionalCreditIds: ['01040064'] }],
  ['02340129', course('02340129', 3)],
  ['01140071', course('01140071', 3.5)],
  ['02340114', course('02340114', 4)],
  ['01040013', course('01040013', 5.5)],
  ['02340125', course('02340125', 3)],
  ['01040136', course('01040136', 4)],
  ['01140075', course('01140075', 5)],
  ['00440252', course('00440252', 5)],
  ['02340124', course('02340124', 4)],
  ['02340141', course('02340141', 3)],
  ['00440105', course('00440105', 4)],
  ['01040220', course('01040220', 2.5)],
  ['01040215', course('01040215', 2.5)],
  ['01040214', course('01040214', 2.5)],
  ['03240033', course('03240033', 3)],
  ['00440131', course('00440131', 5)],
  ['01040034', course('01040034', 3.5)],
  ['00440127', course('00440127', 3.5)],
  ['02340218', course('02340218', 3)],
  ['02340118', course('02340118', 3)],
  ['01140073', course('01140073', 3.5)],
  ['00440137', course('00440137', 5)],
  ['00440157', course('00440157', 2)],
  ['02340123', course('02340123', 4.5)],
  ['01040134', course('01040134', 2.5)],
  ['02340247', course('02340247', 3)],
  ['00460267', course('00460267', 3)],
  [CE_PROJECT_A_ID, namedCourse(CE_PROJECT_A_ID, "פרוייקט א'", 4)],
  [CE_PROJECT_B_ID, namedCourse(CE_PROJECT_B_ID, "פרויקט ב'", 4)],
  [CE_CS_PROJECT_1_ID, namedCourse(CE_CS_PROJECT_1_ID, 'פרויקט במדמח א', 3)],
  [CE_CS_PROJECT_2_ID, namedCourse(CE_CS_PROJECT_2_ID, 'פרויקט במדמח ב', 3)],
]);
const quantumCourses = new Map([
  ['02360343', course('02360343', 3)],
  ['02360990', course('02360990', 3)],
  ['00460241', course('00460241', 3.5)],
  ['00460734', course('00460734', 3)],
  ['00460243', course('00460243', 3)],
  ['02360313', course('02360313', 3)],
  ['01140073', course('01140073', 3.5)],
  ['01140054', course('01140054', 5)],
  ['01040004', course('01040004', 5)],
  ['01040131', course('01040131', 2.5)],
  ['01040033', course('01040033', 2.5)],
]);

function buildSpecializationCatalogsFromFiles() {
  return buildTrackSpecializationCatalogs(
    Object.fromEntries(
      Object.entries(TRACK_SPECIALIZATION_FOLDERS).map(([trackId, folder]) => {
        const dir = join(filesRoot, folder);
        const files = readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => {
            const path = join(dir, entry.name);
            return {
              path,
              content: readFileSync(path, 'utf8'),
            };
          });
        return [trackId, files];
      }),
    ),
  );
}

function emptyCatalog(trackId) {
  return {
    trackId,
    trackFolder: '',
    groups: [],
    diagnostics: [],
    hasErrors: false,
    interactionDisabled: false,
  };
}

function progressFor(trackDef, placedIds, overrides = {}) {
  return computeRequirementsProgress(
    {
      semesters: { 0: placedIds },
      completedCourses: overrides.completedCourses ?? [],
      completedInstances: [],
      grades: {},
      binaryPass: {},
      selectedSpecializations: [],
      doubleSpecializations: [],
      hasEnglishExemption: false,
      miluimCredits: 0,
      englishScore: undefined,
      englishTaughtCourses: [],
      semesterOrder: [1],
      coreToChainOverrides: [],
      courseChainAssignments: {},
      electiveCreditAssignments: overrides.electiveCreditAssignments,
      roboticsMinorEnabled: false,
      entrepreneurshipMinorEnabled: false,
    },
    courses,
    trackDef,
    emptyCatalog(trackDef.id),
    null,
  );
}

function eeCombinedMandatoryProgress({
  includeElectrodynamics = true,
  includeFields = false,
  includeLabs = true,
} = {}) {
  // Test uses 2025 variant courses (01040012, 01040064), so resolve track for 2025.
  // This ensures mandatory course set is built from the 2025 schedule, not the base (2021/22) schedule.
  const eeCombinedTrack2025 = resolveTrackForYear(eeCombinedTrack, 2025);

  const semester4 = [
    '00440127',
    '00440131',
    '00440157',
    '01150203',
    '01140036',
    ...(includeElectrodynamics ? [EE_COMBINED_ELECTRODYNAMICS_ID] : []),
    ...(includeFields ? [EE_COMBINED_FIELDS_ID] : []),
  ];

  return computeRequirementsProgress(
    {
      semesters: {
        // 2025 variant: uses 01040012 (Calculus 1M) instead of 01040031, and 01040064 as alt for 01040016
        1: ['00440102', '01040012', '01140020', '01140074', '02340117', '03240033', '01040064'],
        2: ['00440252', '01040013', '01040038', '01040136', '01140030', '01140076'],
        3: ['00440105', '00440268', '01040034', '01040214', '01040215', '01040220', '01140101'],
        4: semester4,
        5: ['00440137', '00440148', '00440202', '01150204', '01160217'],
        6: ['00440158', '00440167', '01140035'],
        7: [
          '00440169',
          '01140037',
          '01240108',
          ...(includeLabs ? EE_COMBINED_LAB_IDS.slice(0, 2) : []),
        ],
        8: ['01140250', ...(includeLabs ? EE_COMBINED_LAB_IDS.slice(2) : [])],
      },
      completedCourses: [],
      explicitSportCompletions: [],
      completedInstances: [],
      grades: {},
      binaryPass: {},
      selectedSpecializations: [],
      doubleSpecializations: [],
      hasEnglishExemption: false,
      miluimCredits: 0,
      englishScore: undefined,
      englishTaughtCourses: [],
      semesterOrder: [1, 2, 3, 4, 5, 6, 7, 8],
      coreToChainOverrides: [],
      courseChainAssignments: {},
      electiveCreditAssignments: {},
      roboticsMinorEnabled: false,
      entrepreneurshipMinorEnabled: false,
    },
    eeCombinedMandatoryCourses,
    eeCombinedTrack2025,
    emptyCatalog(eeCombinedTrack2025.id),
    null,
  );
}

function ceMandatoryProgress(projectIds, extraIds = []) {
  return computeRequirementsProgress(
    {
      semesters: { 0: [...ceBaseMandatoryIds, ...projectIds, ...extraIds] },
      completedCourses: [],
      explicitSportCompletions: [],
      completedInstances: [],
      grades: {},
      binaryPass: {},
      selectedSpecializations: [],
      doubleSpecializations: [],
      hasEnglishExemption: false,
      miluimCredits: 0,
      englishScore: undefined,
      englishTaughtCourses: [],
      semesterOrder: [1],
      coreToChainOverrides: [],
      courseChainAssignments: {},
      electiveCreditAssignments: {},
      roboticsMinorEnabled: false,
      entrepreneurshipMinorEnabled: false,
      quantumComputingMinorEnabled: false,
    },
    ceMandatoryCourses,
    ceTrack,
    emptyCatalog(ceTrack.id),
    null,
  );
}

function area(progress, areaId) {
  return progress.electiveBreakdown.areaRequirements.find((requirement) => requirement.area === areaId);
}

test('external math course counts as general Technion elective, not faculty elective', () => {
  const eeProgress = progressFor(eeTrack, ['01040000']);
  const physicsProgress = progressFor(eePhysicsTrack, ['01040000']);

  assert.equal(eeProgress.elective.earned, 0);
  assert.equal(eeProgress.general.earned, 3.5);
  assert.deepEqual(eeProgress.electiveBreakdown.generalCourseIds, ['01040000']);

  assert.equal(physicsProgress.elective.earned, 0);
  assert.equal(physicsProgress.general.earned, 3.5);
  assert.deepEqual(physicsProgress.electiveBreakdown.generalCourseIds, ['01040000']);
});

test('free elective and sport courses stay out of faculty elective counting', () => {
  const progress = progressFor(
    eeTrack,
    ['00214119', '03940810'],
    {
      completedCourses: ['00214119', '03940810'],
    },
  );

  assert.equal(progress.elective.earned, 0);
  // MELAG fills the enrichment floor; sport fills the sport floor.
  assert.equal(progress.generalElectivesBreakdown.enrichmentFloor.recognized, 2);
  assert.equal(progress.generalElectivesBreakdown.sportFloor.recognized, 1.5);
});

test('recognized external faculty electives count toward faculty elective up to 9 credits', () => {
  const progress = progressFor(eeTrack, ['00940312', '00960570', '00970317']);

  assert.equal(progress.elective.earned, 9);
  assert.equal(progress.general.earned, 3);
  assert.equal(progress.electiveBreakdown.externalFaculty.earned, 9);
  assert.deepEqual(
    progress.electiveBreakdown.externalFaculty.courseIds,
    ['00940312', '00960570', '00970317'],
  );
});

test('external faculty elective partial-credit exception splits 01240120', () => {
  const progress = progressFor(eeTrack, ['01240120']);

  assert.equal(progress.elective.earned, 3);
  assert.equal(progress.general.earned, 2);
  assert.equal(progress.electiveBreakdown.externalFaculty.earned, 3);
  assert.equal(progress.electiveBreakdown.generalCreditsByCourseId['01240120'], 2);
});

test('external specialization course counts fully outside the 9 credit cap', () => {
  const catalogs = buildSpecializationCatalogsFromFiles();
  const progress = computeRequirementsProgress(
    {
      semesters: { 0: ['03360504', '00940312', '00960570', '00970317'] },
      completedCourses: [],
      completedInstances: [],
      grades: {},
      binaryPass: {},
      selectedSpecializations: [],
      doubleSpecializations: [],
      hasEnglishExemption: false,
      miluimCredits: 0,
      englishScore: undefined,
      englishTaughtCourses: [],
      semesterOrder: [1],
      coreToChainOverrides: [],
      courseChainAssignments: {},
      electiveCreditAssignments: {},
      roboticsMinorEnabled: false,
      entrepreneurshipMinorEnabled: false,
    },
    courses,
    eeTrack,
    catalogs.ee,
    null,
  );

  assert.equal(progress.elective.earned, 12.5);
  assert.equal(progress.general.earned, 3);
  assert.equal(progress.electiveBreakdown.externalFaculty.earned, 9);
});

test('external faculty electives do not satisfy track-specific area minimums', () => {
  const physicsProgress = progressFor(eePhysicsTrack, ['00940312']);
  const mathProgress = progressFor(eeMathTrack, ['00940312']);

  assert.equal(physicsProgress.elective.earned, 4);
  assert.equal(area(physicsProgress, 'ee')?.earned, 0);
  assert.equal(area(physicsProgress, 'physics')?.earned, 0);

  assert.equal(mathProgress.elective.earned, 4);
  assert.equal(area(mathProgress, 'ee')?.earned, 0);
  assert.equal(area(mathProgress, 'math')?.earned, 0);
});

test('ee_physics separates electrical and physics elective credits and required physics course condition', () => {
  const progress = progressFor(eePhysicsTrack, ['00460001', '01160210']);

  assert.equal(progress.elective.earned, 23);
  assert.equal(area(progress, 'ee')?.earned, 18);
  assert.equal(area(progress, 'ee')?.required, 18);
  assert.equal(area(progress, 'physics')?.earned, 5);
  assert.equal(area(progress, 'physics')?.required, 5);
  assert.equal(area(progress, 'physics')?.requiredAnyOfDone, true);
});

test('ee_combined applies the 22 electrical / 5 physics / 30 total policy', () => {
  const progress = progressFor(eeCombinedTrack, ['00460002', '01160210']);

  assert.equal(progress.elective.required, 30);
  assert.equal(eeCombinedTrack.specializationGroupsRequired, 2);
  assert.equal(progress.elective.earned, 27);
  assert.equal(area(progress, 'ee')?.earned, 22);
  assert.equal(area(progress, 'ee')?.required, 22);
  assert.equal(area(progress, 'physics')?.earned, 5);
  assert.equal(area(progress, 'physics')?.required, 5);
});

test('ee_combined keeps the default mandatory and physics requirements when electrodynamics is placed', () => {
  const progress = eeCombinedMandatoryProgress({
    includeElectrodynamics: true,
    includeFields: true,
  });

  assert.equal(progress.mandatory.earned, 136);
  assert.equal(progress.mandatory.required, 136);
  assert.equal(area(progress, 'physics')?.required, 5);
});

test('ee_combined keeps existing behavior when fields is removed', () => {
  const progress = eeCombinedMandatoryProgress({
    includeElectrodynamics: true,
    includeFields: false,
  });

  assert.equal(progress.mandatory.earned, 136);
  assert.equal(progress.mandatory.required, 136);
  assert.equal(area(progress, 'physics')?.required, 5);
});

test('ee_combined shifts 1.5 credits from mandatory to physics electives when fields replaces electrodynamics', () => {
  const progress = eeCombinedMandatoryProgress({
    includeElectrodynamics: false,
    includeFields: true,
  });

  assert.equal(progress.mandatory.earned, 134.5);
  assert.equal(progress.mandatory.required, 134.5);
  assert.equal(area(progress, 'physics')?.required, 6.5);
});

test('ee_combined lab pool completes the 3 mandatory lab credits missing from the schedule', () => {
  const withoutLabs = eeCombinedMandatoryProgress({
    includeElectrodynamics: true,
    includeFields: false,
    includeLabs: false,
  });
  const withLabs = eeCombinedMandatoryProgress({
    includeElectrodynamics: true,
    includeFields: false,
    includeLabs: true,
  });

  assert.equal(withoutLabs.mandatory.earned, 133);
  assert.equal(withoutLabs.mandatory.required, 136);
  assert.equal(withLabs.mandatory.earned, 136);
  assert.equal(withLabs.mandatory.required, 136);
  assert.equal(withLabs.labPoolProgress?.earned, 3);
  assert.equal(withLabs.labPoolProgress?.required, 3);
});

test('ce counts electrical project A and B as the 114.5 mandatory project path', () => {
  const progress = ceMandatoryProgress([CE_PROJECT_A_ID, CE_PROJECT_B_ID]);

  assert.equal(progress.mandatory.earned, 114.5);
  assert.equal(progress.mandatory.required, 114.5);
  assert.equal(progress.elective.required, 26);
});

test('ce counts two CS projects as the 112.5 mandatory project path', () => {
  const progress = ceMandatoryProgress([CE_CS_PROJECT_1_ID, CE_CS_PROJECT_2_ID]);

  assert.equal(progress.mandatory.earned, 112.5);
  assert.equal(progress.mandatory.required, 112.5);
  assert.equal(progress.elective.required, 28);
});

test('ce counts one electrical project and one CS project as the 113.5 mandatory project path', () => {
  const progress = ceMandatoryProgress([CE_PROJECT_A_ID, CE_CS_PROJECT_1_ID]);

  assert.equal(progress.mandatory.earned, 113.5);
  assert.equal(progress.mandatory.required, 113.5);
  assert.equal(progress.elective.required, 27);
});

test('ce algebra alternatives avoid the 111 credit double-placement regression', () => {
  const progress = ceMandatoryProgress(
    [CE_PROJECT_A_ID, CE_PROJECT_B_ID],
    ['01040016'],
  );

  assert.equal(progress.mandatory.earned, 114.5);
  assert.equal(progress.mandatory.required, 114.5);
});

test('quantum computing minor completes option 1', () => {
  const progress = computeQuantumComputingMinorProgress(
    new Set(['02360343', '02360990', '00460241', '00460734', '00460243']),
    quantumCourses,
    86,
    30,
  );

  assert.equal(progress.option1Satisfied, true);
  assert.equal(progress.option2Satisfied, false);
  assert.equal(progress.complete, true);
  assert.equal(progress.gpaStatus, 'eligible');
  assert.equal(progress.missingTotalCredits, false);
});

test('quantum computing minor completes option 2 through each g2 alternative', () => {
  const base = ['02360343', '02360990', '00460734', '00460243', '02360313'];
  const g2Options = [
    ['01140073'],
    ['01140054', '01040004', '01040131'],
    ['01140054', '01040033', '01040131'],
  ];

  for (const g2 of g2Options) {
    const progress = computeQuantumComputingMinorProgress(
      new Set([...base, ...g2]),
      quantumCourses,
      86,
      30,
    );

    assert.equal(progress.option2Satisfied, true);
    assert.equal(progress.complete, true);
  }
});

test('quantum computing minor reports advisor GPA and total-credit status without adding degree credits', () => {
  const progress = computeQuantumComputingMinorProgress(
    new Set(['02360343', '02360990', '00460241', '00460734', '00460243']),
    quantumCourses,
    82,
    29,
  );

  assert.equal(progress.option1Satisfied, true);
  assert.equal(progress.complete, true);
  assert.equal(progress.gpaStatus, 'advisor');
  assert.equal(progress.missingTotalCredits, true);
});

test('cs specialization progress excludes core-locked courses from selected specialization groups', () => {
  const catalogs = buildSpecializationCatalogsFromFiles();
  const machineLearning = catalogs.cs.groups.find((group) => group.name.includes('למידת מכונה'));
  assert.ok(machineLearning, 'Expected CS machine learning specialization group');

  const progress = computeRequirementsProgress(
    {
      semesters: { 0: ['00460195', '00460202', '00460010'] },
      completedCourses: [],
      completedInstances: [],
      grades: {},
      binaryPass: {},
      selectedSpecializations: [machineLearning.id],
      doubleSpecializations: [],
      hasEnglishExemption: false,
      miluimCredits: 0,
      englishScore: undefined,
      englishTaughtCourses: [],
      semesterOrder: [1],
      coreToChainOverrides: [],
      courseChainAssignments: {},
      electiveCreditAssignments: {},
      roboticsMinorEnabled: false,
      entrepreneurshipMinorEnabled: false,
    },
    courses,
    csTrack,
    catalogs.cs,
    null,
  );

  assert.equal(progress.specializationGroups.completed, 0);
  assert.equal(progress.groupDetails[0]?.done, 2);
  assert.equal(progress.groupDetails[0]?.min, 3);
  assert.equal(progress.groupDetails[0]?.complete, false);

  const releasedProgress = computeRequirementsProgress(
    {
      semesters: { 0: ['00460195', '00460202', '00460010'] },
      completedCourses: [],
      completedInstances: [],
      grades: {},
      binaryPass: {},
      selectedSpecializations: [machineLearning.id],
      doubleSpecializations: [],
      hasEnglishExemption: false,
      miluimCredits: 0,
      englishScore: undefined,
      englishTaughtCourses: [],
      semesterOrder: [1],
      coreToChainOverrides: ['00460195'],
      courseChainAssignments: {},
      electiveCreditAssignments: {},
      roboticsMinorEnabled: false,
      entrepreneurshipMinorEnabled: false,
    },
    courses,
    csTrack,
    catalogs.cs,
    null,
  );

  assert.equal(releasedProgress.specializationGroups.completed, 1);
  assert.equal(releasedProgress.groupDetails[0]?.done, 3);
  assert.equal(releasedProgress.groupDetails[0]?.min, 3);
  assert.equal(releasedProgress.groupDetails[0]?.complete, true);
});

test('ee_math separates electrical and math elective credits', () => {
  const progress = progressFor(eeMathTrack, ['00460001', '01040293']);

  assert.equal(progress.elective.required, 25);
  assert.equal(progress.elective.earned, 23);
  assert.equal(area(progress, 'ee')?.earned, 18);
  assert.equal(area(progress, 'ee')?.required, 18);
  assert.equal(area(progress, 'math')?.earned, 5);
  assert.equal(area(progress, 'math')?.required, 6);
});

test('ee_math tracks the 3 mandatory lab credits', () => {
  const withoutLabs = progressFor(eeMathTrack, []);
  const withLabs = progressFor(eeMathTrack, EE_MATH_LAB_IDS);

  assert.equal(withoutLabs.labPoolProgress?.earned, 0);
  assert.equal(withoutLabs.labPoolProgress?.required, 3);
  assert.equal(withLabs.labPoolProgress?.earned, 3);
  assert.equal(withLabs.labPoolProgress?.required, 3);
});

test('manual assignment can move an ambiguous physics elective and is accepted by plan validation', () => {
  const automatic = progressFor(eePhysicsTrack, ['01160210']);
  const overridden = progressFor(eePhysicsTrack, ['01160210'], {
    electiveCreditAssignments: { '01160210': 'ee' },
  });

  assert.equal(area(automatic, 'physics')?.earned, 5);
  assert.equal(area(automatic, 'ee')?.earned, 0);
  assert.equal(area(overridden, 'physics')?.earned, 0);
  assert.equal(area(overridden, 'ee')?.earned, 5);
  assert.deepEqual(overridden.electiveBreakdown.assignmentChoices[0]?.options, ['physics', 'ee', 'general']);

  const plan = sanitizeStudentPlan({
    trackId: 'ee_physics',
    semesters: { 0: ['01160210'], 1: [] },
    completedCourses: [],
    selectedSpecializations: [],
    favorites: [],
    grades: {},
    substitutions: {},
    maxSemester: 1,
    selectedPrereqGroups: {},
    summerSemesters: [],
    currentSemester: null,
    semesterOrder: [1],
    electiveCreditAssignments: { '01160210': 'ee' },
  });

  assert.deepEqual(plan?.electiveCreditAssignments, { '01160210': 'ee' });
});

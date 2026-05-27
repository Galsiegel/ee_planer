import type { SapCourse } from '../types';
import {
  humanitiesFreeElectiveCourses,
  isEnglishCourseId,
  isTechnicalEnglishCourseName,
} from '../data/generalRequirements/courseClassification';
import { teachingSemesterFallbackCourses } from '../data/teachingSemesterFallback';

const BASE_URL = 'https://raw.githubusercontent.com/michael-maltsev/technion-sap-info-fetcher/gh-pages';

interface SapSemester {
  year: number;
  semester: number;
  start: string;
  end: string;
}

interface RawSapCourse {
  general: Record<string, string>;
  schedule: Array<Record<string, string>>;
}

let courseCache: Map<string, SapCourse> | null = null;
let courseCachePromise: Promise<Map<string, SapCourse>> | null = null;

// Split on " או " to get OR-alternatives; within each alternative extract all 8-digit IDs (AND-requirements).
// Example: "(A ו-B) או (C ו-D)" → [[A,B],[C,D]]
function parsePrerequisites(prereqStr?: string): string[][] {
  if (!prereqStr) return [];
  const orGroups = prereqStr.split(/\s+או\s+/);
  return orGroups
    .map(group => (group.match(/\d{8}/g) ?? []))
    .filter(group => group.length > 0);
}

export function parseNoAdditionalCreditIds(value?: string): string[] {
  return [...new Set(value?.match(/\d{8}/g) ?? [])];
}

export function addPrerequisiteOption(course: SapCourse | undefined, prerequisiteGroup: string[]): void {
  if (!course) return;
  const alreadyExists = course.prerequisites.some(
    (group) => group.length === prerequisiteGroup.length
      && group.every((id, index) => id === prerequisiteGroup[index]),
  );
  if (!alreadyExists) {
    course.prerequisites.push(prerequisiteGroup);
  }
}

export async function fetchCourses(): Promise<Map<string, SapCourse>> {
  if (courseCache) return courseCache;
  if (courseCachePromise) return courseCachePromise;

  courseCachePromise = (async () => {
    const semRes = await fetch(`${BASE_URL}/last_semesters.json`);
    if (!semRes.ok) {
      throw new Error(`Failed to fetch semesters: ${semRes.status}`);
    }
    const semesters: SapSemester[] = await semRes.json();

    // Fetch ALL listed semesters in parallel for full course name coverage
    const maps = await Promise.all(
    semesters.map(async (sem) => {
      try {
        const url = `${BASE_URL}/courses_${sem.year}_${sem.semester}.json`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch ${url}: ${res.status}`);
        }
        const rawData: Record<string, RawSapCourse> = await res.json();
        const m = new Map<string, SapCourse>();
        for (const [, course] of Object.entries(rawData)) {
          const g = course.general;
          const id = g['מספר מקצוע'];
          if (!id) continue;
          const credits = parseFloat(g['נקודות'] ?? '0');
          const avgRaw = g['ממוצע'] ?? g['ממוצע ציונים'] ?? g['ממוצע ציון'];
          const sapAverage = avgRaw ? parseFloat(avgRaw) : undefined;
          m.set(id, {
            id,
            name: g['שם מקצוע'] ?? id,
            credits: isNaN(credits) ? 0 : credits,
            prerequisites: parsePrerequisites(g['מקצועות קדם']),
            noAdditionalCreditIds: parseNoAdditionalCreditIds(g['מקצועות ללא זיכוי נוסף']),
            examMoed1: g['מועד א'],
            examMoed2: g['מועד ב'],
            faculty: g['פקולטה'] ?? '',
            syllabus: g['סילבוס'],
            sapAverage: sapAverage && !isNaN(sapAverage) ? sapAverage : undefined,
          });
        }
        return m;
      } catch {
        return new Map<string, SapCourse>(); // skip failed semesters gracefully
      }
    })
  );

  // Merge: oldest first so newest semester (index 0) wins on conflict
  const merged = new Map<string, SapCourse>();
  for (const m of [...maps].reverse()) {
    for (const [id, course] of m) {
      merged.set(id, course);
    }
  }

  // Fallback entries for legacy courses no longer offered in recent semesters
  const LEGACY_COURSES: Record<string, { name: string; credits: number }> = {
    '01130013': { name: 'השלמות פיסיקה 1', credits: 0 }, 
    '01040031': { name: "חשבון אינפיניטסימלי 1מ'", credits: 5.5 },   // Calc 1M 2021 code
    '01040036': { name: 'חשבון דיפרנציאלי ואינטגרלי 1ת', credits: 5 }, // Calc 1 2022 code (was wrong: 3.5 ODE)
    '01040035': { name: "מד\"ר ואינפי 2ח'", credits: 5 },
    '01040221': { name: "פונקצ' מרוכבות והתמרות אינטגרליות", credits: 4 },
    '01040223': { name: "מד\"ח וטורי פוריה", credits: 4 },
    '01130014': { name: 'השלמות פיסיקה 2', credits: 0 }, 
    '03240053': { name: 'לומדת הטרדות מיניות', credits: 0 },
    '00440159': { name: 'מעבדה בהנדסת חשמל 2', credits: 2.5 },        // EE Lab 2, in 2021-23 schedules
    '00440166': { name: 'מעבדה בהנדסת חשמל 3', credits: 2.5 },        // EE Lab 3, in 2021-23 schedules
    // קורסים שהוצעו בסמסטרים ישנים (לא ב-last_semesters.json)
    '00460746': { name: 'אלגוריתמים ויישומים בראייה ממוחשבת', credits: 3 },
    '02360309': { name: 'מבוא לתורת הצפינה', credits: 3 },
    '00460216': { name: 'מיקרוגלים', credits: 3 },
    // קורסים שאינם ב-SAP הנוכחי
    '00460853': { name: 'ארכיטקטורות מחשבים מתקדמות', credits: 3 },
    '00460196': { name: 'בקרה לא לינארית', credits: 3 },
    '00460129': { name: 'פיסיקה של מצב מוצק', credits: 3.5 },
    '00460230': { name: 'התקנים אלקטרוניים מתקדמים', credits: 3 },
    '00460345': { name: 'גרפיקה ממוחשבת', credits: 3 },
    '00460743': { name: 'עיבוד אותות מרחבי', credits: 3 },
    '00460204': { name: 'תקשורת אנלוגית', credits: 3 },
    '00460242': { name: 'פיסיקה סטטיסטית להנדסת חשמל', credits: 3 },
    '00460001': { name: 'הנדסת מערכות תוכנה מבוזרות', credits: 3 },
    '00450114': { name: 'מעבדה מתקדמת בתכנה', credits: 1 },
    '03940900': { name: 'חינוך גופני', credits: 1 },
    '03940901': { name: 'חינוך גופני', credits: 1 },
    '03940902': { name: 'נבחרות ספורט', credits: 1.5 },
    '03940800': { name: 'ספורט נבחרות', credits: 1.5 },
    '03940587': { name: 'מקהלה 3', credits: 2 },
    '03940582': { name: 'תיזמורת סימפונית', credits: 2 },
    '00440262': { name: 'תכן לוגי ומבוא למחשבים', credits: 3.5 },
    '01140250': { name: 'מעב. לפיזיקה לת', credits: 3 },
  };
  for (const [id, info] of Object.entries(LEGACY_COURSES)) {
    if (!merged.has(id)) {
      merged.set(id, { id, name: info.name, credits: info.credits, prerequisites: [], faculty: '' });
    }
  }

  const logicalDesignIntro = merged.get('00440262');
  if (logicalDesignIntro) {
    logicalDesignIntro.noAdditionalCreditIds = [
      ...new Set([
        ...(logicalDesignIntro.noAdditionalCreditIds ?? []),
        '00440252',
        '02340252',
        '02340262',
      ]),
    ];
  }

  for (const course of humanitiesFreeElectiveCourses) {
    if (!merged.has(course.id)) {
      merged.set(course.id, {
        id: course.id,
        name: course.name,
        credits: course.credits,
        prerequisites: [],
        faculty: 'לימודים הומניסטיים ואומנויות',
      });
    }
  }

  for (const fallbackCourse of teachingSemesterFallbackCourses) {
    if (!merged.has(fallbackCourse.id)) {
      merged.set(fallbackCourse.id, {
        id: fallbackCourse.id,
        name: fallbackCourse.name,
        credits: fallbackCourse.credits ?? 0,
        prerequisites: [],
        faculty: '',
      });
    }
  }

  // Remove self-referencing prerequisites (e.g. פיזיקה 1מ listing itself as prereq)
  for (const [id, course] of merged) {
    course.prerequisites = course.prerequisites
      .map(group => group.filter(prereqId => prereqId !== id))
      .filter(group => group.length > 0);
  }

  // Fix: 01140071 (פיסיקה 1מ, new ID) lists 01130013 (פיזיקה 1מ, old ID) as prereq — same course
  const physics1m = merged.get('01140071');
  if (physics1m) {
    physics1m.prerequisites = physics1m.prerequisites
      .map(group => group.filter(id => id !== '01130013'))
      .filter(group => group.length > 0);
  }

  // Fix: 01140075 (פיסיקה 2ממ, new ID) lists 01130014 (פיזיקה 2ממ, old ID) as prereq — same course
  const physics2mm = merged.get('01140075');
  if (physics2mm) {
    physics2mm.prerequisites = physics2mm.prerequisites
      .map(group => group.filter(id => id !== '01130014'))
      .filter(group => group.length > 0);
  }

  // Fix: 01140074 (פיזיקה 1פ) should not require פיזיקה 1מ as a prerequisite.
  const physics1p = merged.get('01140074');
  if (physics1p) {
    physics1p.prerequisites = [];
  }

  // Fix: 01140076 (פיזיקה 2פ) should only require פיזיקה 1פ, not פיזיקה 2ממ.
  const physics2p = merged.get('01140076');
  if (physics2p) {
    physics2p.prerequisites = [['01140074']];
  }

  // Fix: 00460267 (מבנה מחשבים) also accepts this two-course prerequisite path.
  addPrerequisiteOption(merged.get('00460267'), ['02340124', '00440252']);

  // Force correct credits for sport courses (SAP data may have wrong values)
  const SPORT_OVERRIDES: Record<string, number> = {
    '03940900': 1,
    '03940901': 1,
    '03940902': 1.5,
    '03940800': 1.5,
  };
  for (const [id, credits] of Object.entries(SPORT_OVERRIDES)) {
    const course = merged.get(id);
    if (course) course.credits = credits;
  }

  // Teaching-semester overrides (winter = semester A, spring = semester B)
  const TEACHING_SEMESTER: Record<string, 'winter' | 'spring'> = {
    // Winter only
    '00440231': 'winter', // התקנים אלקטרוניים 1
    '00440139': 'winter', // ממירי מתח ממותגים
    '00460042': 'winter', // מבוא למערכות הספק ורשת חכמה
    '00460012': 'winter', // מבוא לאלקטרוניקה גמישה אורגנית
    '00460187': 'winter', // תכן מעגלים אנלוגיים
    '00460212': 'winter', // מבוא לרובוטיקה ח'
    '00460881': 'winter', // אימות פורמלי לחומרה
    '03260002': 'winter', // אתיקה של טכנולוגיות חדשניות (הישאם)
    // Spring only
    '00460279': 'spring', // חישוב מקבילי מואץ
    '00460275': 'spring', // תרגול ואופטימיזציה דינמיים של קוד בינארי
    '00460188': 'spring', // מעגלים אלקטרוניים לאותות מעורבים
    '00460239': 'spring', // מעבדה בננו-אלקטרוניקה
    '00460192': 'spring', // מערכות בקרה 2
    '00460968': 'spring', // מיקרו-עיבוד ומיקרו-מערכות אלקטרומכניות
    '00460205': 'spring', // מבוא לתורת הקידוד בתקשורת
    '01040035': 'spring', // מד"ר ואינפי 2ח'
    '03260010': 'spring', // אופקים אתיים: חקר נוף המטאוורס (הישאם)
  };
  for (const fallbackCourse of teachingSemesterFallbackCourses) {
    TEACHING_SEMESTER[fallbackCourse.id] = fallbackCourse.teachingSemester;
  }
  for (const [id, sem] of Object.entries(TEACHING_SEMESTER)) {
    const course = merged.get(id);
    if (course) course.teachingSemester = sem;
  }

  // English-taught courses (scraped from Technion ugportal, Winter 2024-2025)
  // Note: 03240527 (יסודות היזמות) removed — only sometimes taught in English (user can toggle manually)
  // Note: 03260002 (אתיקה של טכנולוגיות חדשניות) added — always taught in English
  for (const [id, course] of merged) {
    if (isEnglishCourseId(id) || isTechnicalEnglishCourseName(course.name)) {
      course.isEnglish = true;
    }
  }

  courseCache = merged;
    return merged;
  })();

  try {
    return await courseCachePromise;
  } catch (error) {
    courseCachePromise = null;
    throw error;
  }
}

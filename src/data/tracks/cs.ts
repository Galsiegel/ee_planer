import type { TrackDefinition } from '../../types';

export const csTrack: TrackDefinition = {
  id: 'cs',
  name: 'הנדסת מחשבים ותכנה',
  description: 'מכשיר מהנדסי מחשבים המתמחים בתכנון ובנייה של מערכות מחשב, תכנה וחומרה',
  // Base = entry year 2021/22
  totalCreditsRequired: 159,
  mandatoryCredits: 105,
  electiveCreditsRequired: 42,
  generalCreditsRequired: 12,
  specializationGroupsRequired: 2,
  electivePolicy: {
    facultyCourseAreas: ['ee', 'cs'],
  },
  coreRequirement: {
    courses: ['00440140','00440191','00440198','00440202','00460195','00460237','00460266'],
    required: 4,
  },
  semesterSchedule: [
    {
      semester: 1,
      // 2021/22: Calculus 1M = 104031, Linear Algebra 1 = 104016
      courses: ['00440102','01040031','01040016','01140071','02340117','03240033'],
    },
    {
      semester: 2,
      // 2021/22: only 4 mandatory courses (no 104136)
      courses: ['00440252','01040013','01040035','01140075'],
    },
    {
      semester: 3,
      // 2021/22: 104221 + 104223 (not 104214/104215/104220)
      courses: ['00440105','00440114','00440268','01040134','01040221','01040223'],
    },
    {
      semester: 4,
      courses: ['00440127','00440131','00440157','00440101','00460002','01040034'],
    },
    {
      semester: 5,
      courses: ['00440137','00460209','00460210','00440334','00460267'],
    },
    {
      semester: 6,
      courses: ['00440167'],
    },
    {
      semester: 7,
      courses: ['00440169'],
    },
  ],

  yearVariants: {
    // 2022/23: Calculus 1M changed to 104036; sem 2 gains 104038 + 104136;
    //          sem 3 → 104214, 104215; sem 5 keeps 046267
    2022: {
      totalCreditsRequired: 159.5,
      semesterSchedule: [
        {
          semester: 1,
          courses: ['00440102','01040036','01040016','01140071','02340117','03240033'],
        },
        {
          semester: 2,
          courses: ['00440252','01040013','01040038','01040136','01140075'],
        },
        {
          semester: 3,
          courses: ['00440105','00440114','00440268','01040134','01040214','01040215'],
        },
        {
          semester: 4,
          courses: ['00440127','00440131','00440157','00440101','00460002','01040034'],
        },
        {
          semester: 5,
          courses: ['00440137','00460209','00460210','00440334','00460267'],
        },
        { semester: 6, courses: ['00440167'] },
        { semester: 7, courses: ['00440169'] },
      ],
    },

    // 2023/24: Calculus 1M = 104012; 104016 replaces 104064; sem 3 adds 104220;
    //          sem 4: 104033 replaces 104034; sem 5: 046267 removed
    2023: {
      totalCreditsRequired: 159.5,
      semesterSchedule: [
        {
          semester: 1,
          courses: ['00440102','01040012','01140071','02340117','03240033'],
          alternativeGroups: [
            {
              // 104016 is the current course; 104064 is the legacy replacement
              courseIds: ['01040016','01040064'],
              defaultCourseId: '01040016',
            },
          ],
        },
        {
          semester: 2,
          courses: ['00440252','01040013','01040038','01040136','01140075'],
        },
        {
          semester: 3,
          courses: ['00440105','00440114','00440268','01040134','01040214','01040215','01040220'],
        },
        {
          semester: 4,
          courses: ['00440127','00440131','00440157','00440101','00460002','01040033'],
        },
        {
          semester: 5,
          courses: ['00440137','00460209','00460210','00440334'],
        },
        { semester: 6, courses: ['00440167'] },
        { semester: 7, courses: ['00440169'] },
      ],
    },
  },
};

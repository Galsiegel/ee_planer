import type { SpecializationGroupYearVariant } from '../../types';

// Per-year requirement overrides for CS specialization groups.
// Key: specialization group name → entry year → override.
export const CS_SPECIALIZATION_YEAR_VARIANTS: Record<string, Record<number, SpecializationGroupYearVariant>> = {
  'בקרה ורובוטיקה': {
    2021: {
      // 2021/22: 046192 is unconditionally mandatory, no choice between 046192 and 046212
      mandatoryCourseIds: ['00440191', '00460192'],
      mandatoryChoiceGroups: [],
    },
  },
};

import type { TrackId, TrackSpecializationCatalog, SpecializationGroupYearVariant } from '../../types';
import {
  buildTrackSpecializationCatalogs,
  TRACK_SPECIALIZATION_FOLDERS,
  applySpecializationGroupYearVariant,
} from './engine';
import { CS_SPECIALIZATION_YEAR_VARIANTS } from '../../data/specializations/cs_specializations';

const SPECIALIZATION_FILE_CONTENTS = import.meta.glob(
  '/files/קבוצות התמחות/*/*.json',
  {
    eager: true,
    query: '?raw',
    import: 'default',
  },
) as Record<string, string>;

const SPECIALIZATION_CATALOGS = buildTrackSpecializationCatalogs(
  Object.fromEntries(
    Object.entries(TRACK_SPECIALIZATION_FOLDERS).map(([trackId, folder]) => {
      const entries = Object.entries(SPECIALIZATION_FILE_CONTENTS)
        .filter(([path]) => path.includes(`/files/קבוצות התמחות/${folder}/`))
        .map(([path, content]) => ({ path, content }));
      return [trackId, entries];
    }),
  ) as Record<TrackId, { path: string; content: string }[]>,
);

const TRACK_SPECIALIZATION_YEAR_VARIANTS: Partial<Record<TrackId, Record<string, Record<number, SpecializationGroupYearVariant>>>> = {
  cs: CS_SPECIALIZATION_YEAR_VARIANTS,
};

const REPORTED_TRACKS = new Set<TrackId>();

export function getTrackSpecializationCatalog(
  trackId: TrackId,
  catalogYear?: number | null,
): TrackSpecializationCatalog {
  const catalog = SPECIALIZATION_CATALOGS[trackId];
  if (!catalogYear) return catalog;

  const trackVariants = TRACK_SPECIALIZATION_YEAR_VARIANTS[trackId];
  if (!trackVariants) return catalog;

  return {
    ...catalog,
    groups: catalog.groups.map((group) => {
      const groupVariants = trackVariants[group.name];
      if (!groupVariants) return group;
      const variant = groupVariants[catalogYear];
      if (!variant) return group;
      return applySpecializationGroupYearVariant(group, variant);
    }),
  };
}

export function reportTrackSpecializationDiagnostics(trackId: TrackId): void {
  if (REPORTED_TRACKS.has(trackId)) return;
  const catalog = SPECIALIZATION_CATALOGS[trackId];
  if (!catalog || catalog.diagnostics.length === 0) return;

  REPORTED_TRACKS.add(trackId);
  for (const diagnostic of catalog.diagnostics) {
    const reporter = diagnostic.severity === 'error' ? console.error : console.warn;
    reporter(
      `[specializations][${trackId}][${diagnostic.code}] ${diagnostic.message}`,
      {
        filePath: diagnostic.filePath,
        specializationName: diagnostic.specializationName,
      },
    );
  }
}

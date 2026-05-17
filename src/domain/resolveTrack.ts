import type { TrackDefinition } from '../types';

export function resolveTrackForYear(track: TrackDefinition, year: number | null): TrackDefinition {
  if (!year || !track.yearVariants?.[year]) return track;
  return { ...track, ...track.yearVariants[year] };
}

export function getAvailableYears(track: TrackDefinition): number[] {
  return Object.keys(track.yearVariants ?? {})
    .map(Number)
    .sort((a, b) => b - a);  // newest first
}

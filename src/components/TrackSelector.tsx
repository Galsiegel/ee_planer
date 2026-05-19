import type { TrackDefinition } from '../types';
import { usePlanStore } from '../store/planStore';
import { getAvailableYears } from '../domain/resolveTrack';

const TRACK_ICONS: Record<string, string> = {
  ee: '⚡',
  cs: '💻',
  ee_math: '📐',
  ee_physics: '🔬',
};

function formatYear(year: number): string {
  return `${year}/${String(year + 1).slice(-2)}`;
}

export function TrackSelector({ tracks }: { tracks: TrackDefinition[] }) {
  const setTrack = usePlanStore((s) => s.setTrack);

  function handleTrackClick(track: TrackDefinition) {
    const years = getAvailableYears(track);
    setTrack(track.id, years.length > 0 ? years[0] : undefined);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 45%, #1e4d93 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(59,130,246,0.18) 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 left-0 right-0 h-64 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 100% at 30% 100%, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />

      <div className="max-w-3xl w-full relative z-10">
        <div className="text-center mb-14">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <span className="text-3xl">🎓</span>
          </div>
          <h1 className="text-5xl font-black text-white mb-4 tracking-tight">מתכנן לימודים</h1>
          <p className="text-xl font-light" style={{ color: 'rgba(147,197,253,0.9)' }}>הפקולטה להנדסת חשמל ומחשבים - הטכניון</p>
          <p className="text-sm mt-2" style={{ color: 'rgba(147,197,253,0.6)' }}>תכנית לימודים 2025/2026</p>
        </div>

        <p className="text-base font-medium text-center mb-8 tracking-wide" style={{ color: 'rgba(147,197,253,0.7)' }}>בחר מסלול לימודים</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tracks.map((track) => {
            const availableYears = getAvailableYears(track);
            return (
              <button
                key={track.id}
                onClick={() => handleTrackClick(track)}
                className="track-card rounded-2xl p-7 text-right group"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)' }}
              >
                <div className="flex items-start gap-4">
                  <span className="text-4xl leading-none mt-0.5">{TRACK_ICONS[track.id] ?? '📚'}</span>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold mb-1.5 transition-colors" style={{ color: 'rgba(255,255,255,0.95)' }}>
                      {track.name}
                    </h3>
                    <p className="text-sm mb-5 leading-relaxed" style={{ color: 'rgba(147,197,253,0.72)' }}>{track.description}</p>
                    <div className="flex gap-2.5 text-sm flex-wrap">
                      <span className="px-3 py-1 rounded-full font-semibold text-sm" style={{ background: 'rgba(59,130,246,0.22)', color: 'rgba(147,197,253,0.95)', border: '1px solid rgba(99,149,210,0.35)' }}>
                        {track.totalCreditsRequired} נ"ז
                      </span>
                      <span className="px-3 py-1 rounded-full text-sm" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(147,197,253,0.75)', border: '1px solid rgba(255,255,255,0.15)' }}>
                        7 סמסטרים
                      </span>
                      {availableYears.length > 0 && (
                        <span className="px-3 py-1 rounded-full text-sm" style={{ background: 'rgba(34,197,94,0.16)', color: 'rgba(187,247,208,0.95)', border: '1px solid rgba(74,222,128,0.28)' }}>
                          {availableYears.length} שנות קבלה
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

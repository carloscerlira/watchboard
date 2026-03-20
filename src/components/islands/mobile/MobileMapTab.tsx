// src/components/islands/mobile/MobileMapTab.tsx
import IntelMap from '../IntelMap';
import type { MapPoint, MapLine, KpiItem } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { MapCategory } from '../../../lib/map-utils';

interface Props {
  mode: '2d' | '3d';
  points: MapPoint[];
  lines: MapLine[];
  events: FlatEvent[];
  categories: MapCategory[];
  kpis: KpiItem[];
  mapCenter?: { lon: number; lat: number };
  mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  trackerSlug: string;
}

export default function MobileMapTab({
  mode,
  points,
  lines,
  events,
  categories,
  kpis,
  mapCenter,
  mapBounds,
  trackerSlug,
}: Props) {
  const topKpis = kpis.slice(0, 5);

  return (
    <div className="mtab-map-tab">
      {topKpis.length > 0 && (
        <div className="mtab-kpi-row" aria-label="Key indicators">
          {topKpis.map(kpi => (
            <span key={kpi.id} className={`mtab-kpi ${kpi.color}`}>
              <span className="mtab-kpi-val">{kpi.value}</span>
              {' '}
              {kpi.label}
            </span>
          ))}
        </div>
      )}

      {mode === '2d' ? (
        <div className="mtab-map-container">
          <IntelMap
            points={points}
            lines={lines}
            events={events}
            categories={categories}
            mapCenter={mapCenter}
            mapBounds={mapBounds}
          />
        </div>
      ) : (
        <div className="mtab-3d-placeholder">
          <div className="mtab-3d-icon">🌍</div>
          <p className="mtab-3d-title">3D Intelligence Globe</p>
          <p className="mtab-3d-hint">The interactive 3D globe with satellite tracking, missile animations, and cinematic mode works best on desktop.</p>
          <a
            href={`/watchboard/${trackerSlug}/globe/`}
            className="mtab-3d-link"
          >
            Open 3D Globe →
          </a>
        </div>
      )}
    </div>
  );
}

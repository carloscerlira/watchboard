import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint, MapLine } from '../../lib/schemas';
import { catColor, lineColor } from './map-helpers';

interface Props {
  points: MapPoint[];
  lines: MapLine[];
  onSelectPoint: (pt: MapPoint) => void;
}

/** Interpolate an arc between two [lat, lng] points using a sine curve offset */
function arcPositions(
  from: [number, number],
  to: [number, number],
  segments = 40,
): LatLngExpression[] {
  const positions: LatLngExpression[] = [];
  const dlat = to[0] - from[0];
  const dlng = to[1] - from[1];
  const dist = Math.sqrt(dlat * dlat + dlng * dlng);
  const amplitude = dist * 0.2;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lat = from[0] + dlat * t;
    const lng = from[1] + dlng * t;
    const offset = Math.sin(t * Math.PI) * amplitude;
    // perpendicular offset
    const nx = -dlng / dist;
    const ny = dlat / dist;
    positions.push([lat + nx * offset, lng + ny * offset]);
  }
  return positions;
}

const ACTIVE_IDS = new Set(['tehran', 'lincoln']);

const HORMUZ_LINE: LatLngExpression[] = [
  [27.0, 56.1],
  [26.2, 56.4],
];

export default function LeafletMap({ points, lines, onSelectPoint }: Props) {
  const center: LatLngExpression = [30, 50];

  return (
    <MapContainer
      center={center}
      zoom={5}
      minZoom={4}
      maxZoom={8}
      style={{ width: '100%', height: '500px', background: '#0d0f14' }}
      scrollWheelZoom={true}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
      />

      {/* Connection lines */}
      {lines.map((line, i) => {
        const from: [number, number] = [line.from[1], line.from[0]];
        const to: [number, number] = [line.to[1], line.to[0]];
        const positions = arcPositions(from, to);
        return (
          <Polyline
            key={`line-${i}`}
            positions={positions}
            pathOptions={{
              color: lineColor(line.cat),
              weight: 2,
              opacity: 0.6,
              dashArray: '6,4',
            }}
          >
            <Tooltip className="dark-tooltip">{line.label}</Tooltip>
          </Polyline>
        );
      })}

      {/* Strait of Hormuz blockade */}
      <Polyline
        positions={HORMUZ_LINE}
        pathOptions={{
          color: '#e74c3c',
          weight: 3,
          opacity: 0.7,
          dashArray: '8,6',
        }}
        className="hormuz-blockade"
      >
        <Tooltip permanent direction="right" className="dark-tooltip">
          BLOCKED
        </Tooltip>
      </Polyline>

      {/* Map points */}
      {points.map(pt => {
        const isActive = ACTIVE_IDS.has(pt.id);
        const color = catColor(pt.cat);

        return (
          <CircleMarker
            key={pt.id}
            center={[pt.lat, pt.lon]}
            radius={isActive ? 7 : 5}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.85,
              weight: isActive ? 2 : 1,
            }}
            className={isActive ? 'marker-pulse' : undefined}
            eventHandlers={{
              click: () => onSelectPoint(pt),
            }}
          >
            <Tooltip
              permanent={isActive}
              direction="top"
              offset={[0, -8]}
              className="dark-tooltip"
            >
              {pt.label}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

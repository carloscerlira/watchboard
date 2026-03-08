import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, ZoomControl, Circle, Marker } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint, MapLine } from '../../lib/schemas';
import { catColor, lineColor, WEAPON_TYPE_WEIGHTS, WEAPON_TYPE_LABELS, STATUS_LABELS } from './map-helpers';

interface Props {
  points: MapPoint[];
  lines: MapLine[];
  onSelectPoint: (pt: MapPoint) => void;
  onSelectLine?: (line: MapLine) => void;
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
  const amplitude = dist * 0.18;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lat = from[0] + dlat * t;
    const lng = from[1] + dlng * t;
    const offset = Math.sin(t * Math.PI) * amplitude;
    const nx = -dlng / dist;
    const ny = dlat / dist;
    positions.push([lat + nx * offset, lng + ny * offset]);
  }
  return positions;
}

/** Determine marker radius based on category and tier */
function markerRadius(cat: string, tier: number): number {
  if (cat === 'front') return 8;
  if (cat === 'asset') return 6;
  if (tier === 1) return 6;
  return 5;
}

/** Determine if point should show permanent label */
function showPermanentLabel(pt: MapPoint): boolean {
  if (pt.base) return true;
  const majorLabels = new Set([
    'tehran', 'natanz', 'isfahan', 'lincoln', 'ford',
    'hormuz', 'beirut', 'israel_r', 'tel_aviv',
    'dubai', 'red_sea', 'riyadh',
  ]);
  return majorLabels.has(pt.id);
}

/** Determine line weight — uses weapon type if available */
function resolveLineWeight(line: MapLine): number {
  if (line.weaponType) {
    return WEAPON_TYPE_WEIGHTS[line.weaponType] || 1.5;
  }
  if (line.cat === 'strike') return 1.8;
  if (line.cat === 'retaliation') return 1.5;
  return 1.2;
}

/** Determine line opacity — low confidence reduces opacity */
function resolveLineOpacity(line: MapLine): number {
  if (line.confidence === 'low') return 0.3;
  return 0.5;
}

/** Determine line dash pattern — intercepted uses distinct pattern */
function resolveLineDash(line: MapLine): string {
  if (line.status === 'intercepted') return '3,8';
  if (line.cat === 'strike') return '8,4';
  if (line.cat === 'retaliation') return '4,6';
  if (line.cat === 'front') return '2,4';
  return '6,4';
}

/** Build a rich tooltip string for a line with OSINT data */
function buildLineTooltip(line: MapLine): string {
  const parts: string[] = [line.label];

  if (line.weaponType) {
    parts.push(WEAPON_TYPE_LABELS[line.weaponType] || line.weaponType.toUpperCase());
  }

  if (line.platform) {
    parts.push(`Platform: ${line.platform}`);
  }

  if (line.launched != null || line.intercepted != null) {
    const launched = line.launched != null ? `${line.launched} launched` : '';
    const intercepted = line.intercepted != null ? `${line.intercepted} intercepted` : '';
    const counts = [launched, intercepted].filter(Boolean).join(', ');
    if (counts) parts.push(counts);
  }

  if (line.status) {
    parts.push(`Status: ${STATUS_LABELS[line.status] || line.status.toUpperCase()}`);
  }

  if (line.damage) {
    parts.push(`Damage: ${line.damage}`);
  }

  if (line.casualties) {
    parts.push(`Casualties: ${line.casualties}`);
  }

  if (line.time) {
    parts.push(`Time: ${line.time}`);
  }

  return parts.join(' | ');
}

/** Create a DivIcon for military bases */
function baseIcon(): L.DivIcon {
  return L.divIcon({
    className: 'base-marker',
    html: '<span class="base-marker-inner">\u2B1F</span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export default function LeafletMap({ points, lines, onSelectPoint, onSelectLine }: Props) {
  const center: LatLngExpression = [29, 49];

  const basePoints = points.filter(p => p.base);
  const frontPoints = points.filter(p => p.cat === 'front');
  const regularPoints = points.filter(p => p.cat !== 'front' && !p.base);

  return (
    <MapContainer
      center={center}
      zoom={5}
      minZoom={4}
      maxZoom={8}
      style={{ width: '100%', height: '100%', background: '#0d0f14' }}
      scrollWheelZoom={true}
      zoomControl={false}
    >
      <ZoomControl position="topright" />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />

      {/* Active front zones -- soft glowing circles */}
      {frontPoints.map(pt => (
        <Circle
          key={`zone-${pt.id}`}
          center={[pt.lat, pt.lon]}
          radius={pt.id === 'hormuz' ? 60000 : 40000}
          pathOptions={{
            color: '#9b59b6',
            fillColor: '#9b59b6',
            fillOpacity: 0.08,
            weight: 1,
            opacity: 0.3,
            dashArray: '4,4',
          }}
          className="front-zone-pulse"
        />
      ))}

      {/* Connection lines -- arc vectors with OSINT enhancements */}
      {lines.map((line, i) => {
        const from: [number, number] = [line.from[1], line.from[0]];
        const to: [number, number] = [line.to[1], line.to[0]];
        const positions = arcPositions(from, to);
        const color = lineColor(line.cat);
        const tooltipContent = buildLineTooltip(line);

        return (
          <Polyline
            key={`line-${i}`}
            positions={positions}
            pathOptions={{
              color,
              weight: resolveLineWeight(line),
              opacity: resolveLineOpacity(line),
              dashArray: resolveLineDash(line),
            }}
            eventHandlers={onSelectLine ? { click: () => onSelectLine(line) } : undefined}
          >
            <Tooltip className="dark-tooltip osint-tooltip">
              <span>
                {tooltipContent.split(' | ').map((part, j) => (
                  <span key={j}>{j > 0 && <br />}{part}</span>
                ))}
              </span>
            </Tooltip>
          </Polyline>
        );
      })}

      {/* Military bases -- pentagon icon, always visible */}
      {basePoints.map(pt => (
        <Marker
          key={pt.id}
          position={[pt.lat, pt.lon]}
          icon={baseIcon()}
          eventHandlers={{ click: () => onSelectPoint(pt) }}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -14]}
            className="dark-tooltip base-tooltip"
          >
            {pt.label}
          </Tooltip>
        </Marker>
      ))}

      {/* Front zone markers */}
      {frontPoints.map(pt => {
        const color = catColor(pt.cat);
        return (
          <CircleMarker
            key={pt.id}
            center={[pt.lat, pt.lon]}
            radius={markerRadius(pt.cat, pt.tier)}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.7,
              weight: 2,
            }}
            className="marker-pulse"
            eventHandlers={{ click: () => onSelectPoint(pt) }}
          >
            <Tooltip
              permanent={showPermanentLabel(pt)}
              direction="top"
              offset={[0, -10]}
              className="dark-tooltip"
            >
              {pt.label}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* Regular map points -- sorted so tier-1 renders on top */}
      {[...regularPoints]
        .sort((a, b) => b.tier - a.tier)
        .map(pt => {
          const color = catColor(pt.cat);
          const isPermanent = showPermanentLabel(pt);
          const radius = markerRadius(pt.cat, pt.tier);

          return (
            <CircleMarker
              key={pt.id}
              center={[pt.lat, pt.lon]}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: pt.tier === 1 ? 0.9 : 0.7,
                weight: pt.tier === 1 ? 2 : 1,
              }}
              className={pt.tier === 1 ? 'marker-pulse' : undefined}
              eventHandlers={{ click: () => onSelectPoint(pt) }}
            >
              <Tooltip
                permanent={isPermanent}
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

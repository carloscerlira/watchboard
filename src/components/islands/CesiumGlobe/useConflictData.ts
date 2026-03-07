import { useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  defined,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import type { MapPoint, MapLine } from '../../../lib/schemas';
import {
  catToCesiumColor,
  markerPixelSize,
  frontZoneRadius,
  arc3D,
  lineWidth,
  arcMaterial,
} from './cesium-helpers';

// ── Point helpers ──

function isNavalVessel(pt: MapPoint): boolean {
  if (pt.cat !== 'asset') return false;
  const l = pt.label.toLowerCase();
  return l.includes('uss ') || l.includes('cvn') || l.includes('ddg') || l.includes('navy');
}

function isAirBase(pt: MapPoint): boolean {
  if (pt.cat !== 'asset') return false;
  return !!pt.base;
}

function navalZoneRadius(pt: MapPoint): number {
  const l = pt.label.toLowerCase();
  if (l.includes('lincoln') || l.includes('ford')) return 80_000;
  return 40_000;
}

// ── Hook ──

export function useConflictData(
  viewer: CesiumViewer | null,
  points: MapPoint[],
  lines: MapLine[],
  onSelect: (pt: MapPoint) => void,
): void {
  const pointEntitiesRef = useRef<Entity[]>([]);
  const arcEntitiesRef = useRef<Entity[]>([]);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const pointMapRef = useRef<Map<Entity, MapPoint>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // ── Points ──
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Remove old point entities
    pointEntitiesRef.current.forEach(e => {
      try { viewer.entities.remove(e); } catch { /* already removed */ }
    });
    pointEntitiesRef.current = [];
    pointMapRef.current.clear();

    // Create new point entities
    for (const pt of points) {
      const color = catToCesiumColor(pt.cat);
      const isFront = pt.cat === 'front';
      const isShip = isNavalVessel(pt);
      const isBase = isAirBase(pt);
      const isAsset = pt.cat === 'asset';
      const showLabel = isAsset || isFront || pt.tier === 1;

      let pixelSize = markerPixelSize(pt.cat, pt.tier);
      if (isShip) pixelSize = 14;
      else if (isBase) pixelSize = 10;

      let markerColor = color;
      if (isShip) markerColor = Color.fromCssColorString('#00ccff');
      else if (isBase) markerColor = Color.fromCssColorString('#4aa3df');

      let labelPrefix = '';
      if (isShip) labelPrefix = '\u2693 ';
      else if (isBase) labelPrefix = '\u2B1F ';

      const entity = viewer.entities.add({
        position: Cartesian3.fromDegrees(pt.lon, pt.lat, 0),
        name: pt.label,
        point: {
          pixelSize,
          color: markerColor,
          outlineColor: markerColor.withAlpha(isShip ? 0.6 : 0.4),
          outlineWidth: isShip ? 4 : pt.tier === 1 ? 3 : 1,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 5e6, 0.5),
        },
        label: showLabel ? {
          text: `${labelPrefix}${pt.label}`,
          font: isShip ? "bold 12px 'DM Sans', sans-serif" : "11px 'DM Sans', sans-serif",
          fillColor: isShip ? Color.fromCssColorString('#00eeff') : Color.fromCssColorString('#e8e9ed'),
          outlineColor: Color.fromCssColorString('#0a0b0e'),
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          pixelOffset: new Cartesian3(0, -14, 0) as any,
          scaleByDistance: new NearFarScalar(1e4, 1.0, 5e6, 0.4),
          distanceDisplayCondition: new DistanceDisplayCondition(0, isAsset ? 8e6 : 5e6),
        } : undefined,
        ellipse: (isFront || isShip || isBase) ? {
          semiMajorAxis: isFront ? frontZoneRadius(pt.id) : isShip ? navalZoneRadius(pt) : 50_000,
          semiMinorAxis: isFront ? frontZoneRadius(pt.id) : isShip ? navalZoneRadius(pt) : 50_000,
          material: (isShip ? markerColor : isFront ? color : markerColor).withAlpha(
            isFront ? 0.08 : isShip ? 0.05 : 0.03,
          ),
          outline: true,
          outlineColor: (isShip ? markerColor : isFront ? color : markerColor).withAlpha(
            isFront ? 0.25 : isShip ? 0.3 : 0.15,
          ),
          outlineWidth: isShip ? 2 : 1,
        } : undefined,
      });

      pointEntitiesRef.current.push(entity);
      pointMapRef.current.set(entity, pt);
    }

    return () => {
      if (!viewer.isDestroyed()) {
        pointEntitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* already removed */ }
        });
      }
      pointEntitiesRef.current = [];
      pointMapRef.current.clear();
    };
  }, [viewer, points]);

  // ── Click handler ──
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Clean up previous handler
    if (handlerRef.current) {
      handlerRef.current.destroy();
      handlerRef.current = null;
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id instanceof Object) {
        const pt = pointMapRef.current.get(picked.id as Entity);
        if (pt) onSelectRef.current(pt);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (handlerRef.current && !handlerRef.current.isDestroyed()) {
        handlerRef.current.destroy();
      }
      handlerRef.current = null;
    };
  }, [viewer]);

  // ── Arcs ──
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Remove old arc entities
    arcEntitiesRef.current.forEach(e => {
      try { viewer.entities.remove(e); } catch { /* already removed */ }
    });
    arcEntitiesRef.current = [];

    // Create new arc entities
    for (const line of lines) {
      const positions = arc3D(line.from, line.to);

      const entity = viewer.entities.add({
        name: line.label,
        polyline: {
          positions,
          width: lineWidth(line.cat),
          material: arcMaterial(line.cat),
        },
      });
      arcEntitiesRef.current.push(entity);
    }

    return () => {
      if (!viewer.isDestroyed()) {
        arcEntitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* already removed */ }
        });
      }
      arcEntitiesRef.current = [];
    };
  }, [viewer, lines]);
}

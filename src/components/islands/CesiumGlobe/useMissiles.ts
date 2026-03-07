import { useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  CallbackProperty,
  PolylineGlowMaterialProperty,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import type { MapLine } from '../../../lib/schemas';
import { arc3D, catToCesiumColor, lineWidth, animationDuration, arcMaterial } from './cesium-helpers';

interface MissileAnimation {
  lineId: string;
  startTime: number;
  duration: number;
  arcPositions: Cartesian3[];
  trailEntity: Entity;
  projectileEntity: Entity;
  completed: boolean;
}

const MAX_CONCURRENT = 10;

export function useMissiles(
  viewer: CesiumViewer | null,
  lines: MapLine[],
  currentDate: string,
  isPlaying: boolean,
): { activeCount: number } {
  const prevDateRef = useRef<string>(currentDate);
  const seenLineIdsRef = useRef<Set<string>>(new Set());
  const animationsRef = useRef<MissileAnimation[]>([]);
  const rafRef = useRef<number>(0);
  const activeCountRef = useRef(0);

  // Initialize seenLineIds with all lines before currentDate
  useEffect(() => {
    const seen = new Set<string>();
    for (const l of lines) {
      if (l.date < currentDate) seen.add(l.id);
    }
    seenLineIdsRef.current = seen;
    prevDateRef.current = currentDate;
  }, [lines]); // only on lines change (initial load)

  // Main animation effect
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const prevDate = prevDateRef.current;
    prevDateRef.current = currentDate;

    // If date went backwards (user scrubbed back), reset seen set
    if (currentDate < prevDate) {
      // Remove all in-flight animations
      cleanupAnimations(viewer, animationsRef.current);
      animationsRef.current = [];

      // Reset seen to only include lines before new currentDate
      const seen = new Set<string>();
      for (const l of lines) {
        if (l.date < currentDate) seen.add(l.id);
      }
      seenLineIdsRef.current = seen;
      return;
    }

    // Find newly-active lines
    const newLines = lines.filter(
      l => l.date === currentDate && !seenLineIdsRef.current.has(l.id),
    );

    if (newLines.length === 0) return;

    // Mark as seen
    for (const l of newLines) {
      seenLineIdsRef.current.add(l.id);
    }

    // Only animate strike/retaliation during playback
    const animatable = newLines.filter(
      l => isPlaying && (l.cat === 'strike' || l.cat === 'retaliation'),
    );

    if (animatable.length === 0) return;

    // Cap concurrent animations
    const toAnimate = animatable.slice(0, MAX_CONCURRENT - animationsRef.current.filter(a => !a.completed).length);

    const now = performance.now();

    for (let i = 0; i < toAnimate.length; i++) {
      const line = toAnimate[i];
      const arcPositions = arc3D(line.from, line.to, 60, 150_000);
      const duration = animationDuration(line.from, line.to);
      const startTime = now + i * 50; // stagger by 50ms
      const color = catToCesiumColor(line.cat);

      // Trail entity — polyline that grows as missile advances
      const trailEntity = viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(Math.max(elapsed / duration, 0), 1);
            const segCount = Math.max(1, Math.floor(progress * arcPositions.length));
            return arcPositions.slice(0, segCount);
          }, false) as any,
          width: lineWidth(line.cat) + 1,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color: color.withAlpha(0.9),
          }),
        },
      });

      // Projectile entity — bright point at the missile head
      const projectileEntity = viewer.entities.add({
        position: new CallbackProperty(() => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(Math.max(elapsed / duration, 0), 1);
          const idx = Math.min(
            Math.floor(progress * (arcPositions.length - 1)),
            arcPositions.length - 1,
          );
          return arcPositions[idx];
        }, false) as any,
        point: {
          pixelSize: 6,
          color: Color.WHITE,
          outlineColor: color.withAlpha(0.8),
          outlineWidth: 4,
        },
      });

      animationsRef.current.push({
        lineId: line.id,
        startTime,
        duration,
        arcPositions,
        trailEntity,
        projectileEntity,
        completed: false,
      });
    }

    // Start animation loop if not already running
    if (rafRef.current === 0) {
      const tick = () => {
        if (!viewer || viewer.isDestroyed()) {
          rafRef.current = 0;
          return;
        }

        let anyActive = false;

        for (const anim of animationsRef.current) {
          if (anim.completed) continue;

          const elapsed = performance.now() - anim.startTime;
          if (elapsed >= anim.duration) {
            // Animation complete — remove projectile, finalize trail
            try { viewer.entities.remove(anim.projectileEntity); } catch { /* ok */ }
            try { viewer.entities.remove(anim.trailEntity); } catch { /* ok */ }

            // Add final static arc
            viewer.entities.add({
              polyline: {
                positions: anim.arcPositions,
                width: lineWidth(lines.find(l => l.id === anim.lineId)?.cat || 'strike'),
                material: arcMaterial(lines.find(l => l.id === anim.lineId)?.cat || 'strike'),
              },
            });

            anim.completed = true;
          } else {
            anyActive = true;
          }
        }

        activeCountRef.current = animationsRef.current.filter(a => !a.completed).length;

        if (anyActive) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = 0;
          // Clean up completed animations from array
          animationsRef.current = animationsRef.current.filter(a => !a.completed);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    }
  }, [viewer, currentDate, isPlaying, lines]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (viewer && !viewer.isDestroyed()) {
        cleanupAnimations(viewer, animationsRef.current);
      }
      animationsRef.current = [];
    };
  }, [viewer]);

  return { activeCount: activeCountRef.current };
}

function cleanupAnimations(viewer: CesiumViewer, anims: MissileAnimation[]) {
  for (const anim of anims) {
    try { viewer.entities.remove(anim.trailEntity); } catch { /* ok */ }
    try { viewer.entities.remove(anim.projectileEntity); } catch { /* ok */ }
  }
}

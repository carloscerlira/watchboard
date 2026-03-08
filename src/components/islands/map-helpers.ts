import { MAP_CATEGORIES } from '../../lib/map-utils';

export function tierLabelFull(t: number): string {
  return t === 1
    ? 'Tier 1 — Official'
    : t === 2
      ? 'Tier 2 — Major Outlet'
      : t === 3
        ? 'Tier 3 — Institutional'
        : 'Tier 4';
}

export function tierClass(t: number): string {
  return t === 1 ? 't1' : t === 2 ? 't2' : t === 3 ? 't3' : 't4';
}

export function catColor(cat: string): string {
  return MAP_CATEGORIES.find(c => c.id === cat)?.color || '#888';
}

export function lineColor(cat: string): string {
  if (cat === 'strike') return '#e74c3c';
  if (cat === 'retaliation') return '#f39c12';
  if (cat === 'front') return '#9b59b6';
  return '#3498db';
}

// ── OSINT weapon-type helpers ──

export const WEAPON_TYPE_WEIGHTS: Record<string, number> = {
  ballistic: 2.5,
  cruise: 2.0,
  drone: 1.5,
  rocket: 2.2,
  mixed: 2.0,
  unknown: 1.5,
};

export const WEAPON_TYPE_LABELS: Record<string, string> = {
  ballistic: 'BALLISTIC',
  cruise: 'CRUISE',
  drone: 'DRONE/UAV',
  rocket: 'ROCKET',
  mixed: 'MIXED',
  unknown: 'UNKNOWN',
};

export const STATUS_LABELS: Record<string, string> = {
  hit: 'HIT',
  intercepted: 'INTERCEPTED',
  partial: 'PARTIAL',
  unknown: 'UNCONFIRMED',
};

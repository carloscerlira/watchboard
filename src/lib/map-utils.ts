// ── Sparkline generator for economic data SVGs ──
export function generateSparkline(data: number[], w: number, h: number): string {
  const min = Math.min(...data) * 0.98;
  const max = Math.max(...data) * 1.02;
  const range = max - min || 1;
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// ── Map category definitions ──
export interface MapCategory {
  id: string;
  label: string;
  color: string;
  dotColor: string;
}

export const MAP_CATEGORIES: MapCategory[] = [
  { id: 'strike', label: 'US/Israel Strikes', color: '#e74c3c', dotColor: '#e74c3c' },
  { id: 'retaliation', label: 'Iranian Retaliation', color: '#f39c12', dotColor: '#f39c12' },
  { id: 'asset', label: 'US Military Assets', color: '#3498db', dotColor: '#3498db' },
  { id: 'front', label: 'Active Fronts', color: '#9b59b6', dotColor: '#9b59b6' },
];

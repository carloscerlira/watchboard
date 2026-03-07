import type { TimelineEra, TimelineEvent } from './schemas';

export interface FlatEvent extends TimelineEvent {
  resolvedDate: string; // "YYYY-MM-DD"
}

/**
 * Flatten timeline eras into a flat event array with resolved dates.
 * Only events from `src/data/events/*.json` partitions (Crisis era) get day-level dates.
 * Historical eras are excluded since they don't have day-level granularity.
 */
export function flattenTimelineEvents(
  timeline: TimelineEra[],
  eventModulePaths?: string[],
): FlatEvent[] {
  const events: FlatEvent[] = [];

  for (const era of timeline) {
    // Only process crisis-era events (they come from daily partition files)
    if (!era.era.toLowerCase().includes('crisis') && !era.era.toLowerCase().includes('war')) {
      continue;
    }

    for (const ev of era.events) {
      const resolvedDate = resolveEventDate(ev.year);
      if (resolvedDate) {
        events.push({ ...ev, resolvedDate });
      }
    }
  }

  return events;
}

/**
 * Resolve a human-readable date string (e.g., "Mar 1", "Feb 28") to "YYYY-MM-DD".
 * Assumes year 2026 for crisis-era events.
 */
function resolveEventDate(yearField: string): string | null {
  const year = 2026;

  // Try "Mon DD" format (e.g., "Mar 1", "Feb 28")
  const monthDay = yearField.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i);
  if (monthDay) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const m = months[monthDay[1].toLowerCase()];
    const d = monthDay[2].padStart(2, '0');
    if (m) return `${year}-${m}-${d}`;
  }

  // Try "YYYY-MM-DD" format
  if (/^\d{4}-\d{2}-\d{2}$/.test(yearField)) {
    return yearField;
  }

  // Try just a year (e.g., "2026") — skip, not day-level
  if (/^\d{4}$/.test(yearField)) {
    return null;
  }

  return null;
}

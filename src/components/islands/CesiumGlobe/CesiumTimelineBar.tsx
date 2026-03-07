import { useMemo } from 'react';
import type { FlatEvent } from '../../../lib/timeline-utils';

interface Props {
  minDate: string;
  maxDate: string;
  currentDate: string;
  isPlaying: boolean;
  playbackSpeed: number;
  mode: 'historical' | 'live';
  events: FlatEvent[];
  onDateChange: (date: string) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onGoLive: () => void;
}

const SPEEDS = [0.5, 1, 2, 5];

const EVENT_TYPE_COLORS: Record<string, string> = {
  military: '#e74c3c',
  diplomatic: '#3498db',
  humanitarian: '#f39c12',
  economic: '#2ecc71',
};

function dateToDay(date: string, minDate: string): number {
  return Math.round(
    (new Date(date).getTime() - new Date(minDate).getTime()) / 86400000,
  );
}

function dayToDate(day: number, minDate: string): string {
  const d = new Date(minDate);
  d.setDate(d.getDate() + day);
  return d.toISOString().split('T')[0];
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function stepDate(date: string, delta: number, min: string, max: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  const next = d.toISOString().split('T')[0];
  if (next < min) return min;
  if (next > max) return max;
  return next;
}

export default function CesiumTimelineBar({
  minDate,
  maxDate,
  currentDate,
  isPlaying,
  playbackSpeed,
  mode,
  events,
  onDateChange,
  onTogglePlay,
  onSpeedChange,
  onGoLive,
}: Props) {
  const totalDays = dateToDay(maxDate, minDate);
  const currentDay = dateToDay(currentDate, minDate);

  // Event ticks positioned by date
  const ticks = useMemo(() => {
    const seen = new Set<string>();
    return events
      .filter(ev => {
        // Deduplicate by date+type for cleaner visuals
        const key = `${ev.resolvedDate}-${ev.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return ev.resolvedDate >= minDate && ev.resolvedDate <= maxDate;
      })
      .map(ev => ({
        date: ev.resolvedDate,
        type: ev.type,
        title: ev.title,
        pct: totalDays > 0 ? (dateToDay(ev.resolvedDate, minDate) / totalDays) * 100 : 0,
      }));
  }, [events, minDate, maxDate, totalDays]);

  // Count events for current date (for badge)
  const currentEventCount = useMemo(
    () => events.filter(ev => ev.resolvedDate === currentDate).length,
    [events, currentDate],
  );

  return (
    <div className="globe-timeline-enhanced">
      {/* Controls row */}
      <div className="globe-tl-controls">
        <button
          className="globe-tl-btn"
          onClick={() => onDateChange(stepDate(currentDate, -1, minDate, maxDate))}
          aria-label="Previous day"
        >
          &#9664;
        </button>
        <button
          className="globe-tl-btn globe-tl-play"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '\u275A\u275A' : '\u25B6'}
        </button>
        <button
          className="globe-tl-btn"
          onClick={() => onDateChange(stepDate(currentDate, 1, minDate, maxDate))}
          aria-label="Next day"
        >
          &#9654;
        </button>

        {/* Speed selector */}
        <div className="globe-tl-speed">
          {SPEEDS.map(s => (
            <button
              key={s}
              className={`globe-tl-speed-btn ${playbackSpeed === s ? 'active' : ''}`}
              onClick={() => onSpeedChange(s)}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* LIVE button */}
        <button
          className={`globe-tl-live ${mode === 'live' ? 'active' : ''}`}
          onClick={onGoLive}
        >
          <span className="globe-tl-live-dot" />
          LIVE
        </button>

        {/* Current date */}
        <span className="globe-tl-current-date">
          {formatDate(currentDate)}
          {currentEventCount > 0 && (
            <span className="globe-tl-event-badge">{currentEventCount}</span>
          )}
        </span>
      </div>

      {/* Timeline track with event ticks */}
      <div className="globe-tl-track-container">
        <span className="globe-tl-date-edge">{formatDate(minDate)}</span>
        <div className="globe-tl-track">
          {/* Event tick marks */}
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="globe-tl-tick"
              style={{
                left: `${tick.pct}%`,
                backgroundColor: EVENT_TYPE_COLORS[tick.type] || '#888',
              }}
              title={`${tick.title} (${tick.date})`}
            />
          ))}
          <input
            type="range"
            className="globe-tl-slider"
            min={0}
            max={totalDays}
            value={currentDay}
            aria-label="Timeline date selector"
            aria-valuetext={formatDate(currentDate)}
            onChange={e => onDateChange(dayToDate(Number(e.target.value), minDate))}
          />
        </div>
        <span className="globe-tl-date-edge">{formatDate(maxDate)}</span>
      </div>
    </div>
  );
}

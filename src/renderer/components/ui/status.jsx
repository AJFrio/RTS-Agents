import React from 'react';
import { IconCheck, IconAlert, IconClock, IconStop, IconSync } from './icons.jsx';

/**
 * Status semantics (DESIGN.md §3.1): color only ever carries state.
 * running = emerald pulse, completed = emerald check, queued/pending =
 * amber, failed/stopped = red, everything else neutral.
 */
const STATUS_META = {
  running: {
    label: 'Running',
    text: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    dot: 'bg-emerald-500',
    pulse: true,
    Icon: IconSync,
  },
  completed: {
    label: 'Completed',
    text: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    dot: 'bg-emerald-500',
    Icon: IconCheck,
  },
  queued: {
    label: 'Queued',
    text: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    dot: 'bg-amber-500',
    Icon: IconClock,
  },
  pending: {
    label: 'Pending',
    text: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    dot: 'bg-amber-500',
    Icon: IconClock,
  },
  failed: {
    label: 'Failed',
    text: 'text-red-700 dark:text-red-400',
    bg: 'bg-red-500/10',
    dot: 'bg-red-500',
    Icon: IconAlert,
  },
  stopped: {
    label: 'Stopped',
    text: 'text-red-700 dark:text-red-400',
    bg: 'bg-red-500/10',
    dot: 'bg-red-500',
    Icon: IconStop,
  },
  error: {
    label: 'Error',
    text: 'text-red-700 dark:text-red-400',
    bg: 'bg-red-500/10',
    dot: 'bg-red-500',
    Icon: IconAlert,
  },
  idle: {
    label: 'Idle',
    text: 'text-neutral-500 dark:text-neutral-400',
    bg: 'bg-neutral-400/10',
    dot: 'bg-neutral-400',
    Icon: IconClock,
  },
};

export function statusMeta(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_META[key] || STATUS_META.idle;
}

/** Agent canvas: completed work is grey; running stays emerald. */
export function canvasStatusMeta(status) {
  const key = String(status || '').toLowerCase();
  const base = statusMeta(status);
  if (key === 'completed') {
    return {
      ...base,
      text: 'text-neutral-500 dark:text-neutral-400',
      bg: 'bg-neutral-400/10',
      dot: 'bg-neutral-400',
    };
  }
  return base;
}

export function StatusDot({ status, size = 6, className = '', variant }) {
  const meta = variant === 'canvas' ? canvasStatusMeta(status) : statusMeta(status);
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ${meta.dot} ${
        meta.pulse ? 'status-pulse' : ''
      } ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function StatusPill({ status, className = '', withIcon = false }) {
  const meta = statusMeta(status);
  const Label = meta.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.bg} ${meta.text} ${className}`}
    >
      <StatusDot status={status} />
      {withIcon && <Label size={11} />}
      {meta.label}
    </span>
  );
}

export function RunningBadge({ status }) {
  const running = String(status || '').toLowerCase() === 'running';
  if (!running) return null;
  return <StatusDot status="running" size={7} className="status-pulse" />;
}

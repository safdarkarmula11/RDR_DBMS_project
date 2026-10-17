import React from 'react';

const TONE_MAP = {
  // Instance statuses
  running: 'ok',
  stopped: 'muted',
  pending: 'warn',
  suspended: 'warn',
  terminated: 'danger',

  // Invoice statuses
  draft: 'muted',
  issued: 'brand',
  paid: 'ok',
  overdue: 'danger',
  void: 'muted',

  // Ticket statuses
  open: 'warn',
  in_progress: 'brand',
  resolved: 'ok',
  closed: 'muted',

  // Priority & SLA
  low: 'muted',
  medium: 'brand',
  high: 'warn',
  urgent: 'danger',
  critical: 'danger',

  // Volume & Infra
  available: 'ok',
  attached: 'brand',
  deleted: 'danger',
  active: 'ok',
  inactive: 'muted',
  maintenance: 'warn',
  retired: 'danger',

  // Check statuses
  pass: 'ok',
  fail: 'danger',
  warning: 'warn'
};

/**
 * StatusBadge ensures single tone mapping for every status in NimbusHost.
 */
export default function StatusBadge({ value, label, className = '' }) {
  if (!value) return null;
  const normalized = String(value).toLowerCase().replace(/[\s-]/g, '_');
  const tone = TONE_MAP[normalized] || 'muted';
  const displayLabel = label || String(value).replace(/_/g, ' ');

  return (
    <span className={`badge badge--${tone} ${className}`.trim()} role="status">
      <i className="dot" aria-hidden="true" />
      <span>{displayLabel}</span>
    </span>
  );
}


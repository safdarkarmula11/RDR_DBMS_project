import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

const ICONS = {
  danger: AlertCircle,
  warn: AlertTriangle,
  ok: CheckCircle,
  info: Info
};

/**
 * Banner component for page-level alerts and DB error hints.
 */
export default function Banner({
  tone = 'info',
  message,
  hint,
  children,
  onDismiss,
  className = ''
}) {
  const Icon = ICONS[tone] || Info;

  return (
    <div className={`banner banner--${tone} ${className}`.trim()} role="alert">
      <div className="banner-icon" style={{ flexShrink: 0, marginTop: 1 }}>
        <Icon size={18} aria-hidden="true" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {message && <strong>{message}</strong>}
        {children}
        {hint && <div className="banner-hint">{hint}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="btn btn--ghost btn--sm"
          style={{ padding: 4, height: 24, width: 24, minHeight: 'unset', minWidth: 'unset' }}
          aria-label="Dismiss banner"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}


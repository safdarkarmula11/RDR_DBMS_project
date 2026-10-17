import React from 'react';
import { Inbox } from 'lucide-react';
import Button from './Button';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No records found',
  description = 'There are no items to display right now.',
  actionLabel,
  onAction,
  className = ''
}) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <Icon size={44} strokeWidth={1.5} color="var(--muted)" aria-hidden="true" />
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-desc">{description}</div>
      {actionLabel && onAction && (
        <div style={{ marginTop: 8 }}>
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}


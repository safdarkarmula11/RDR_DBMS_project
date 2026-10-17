import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Button from './Button';
import Input from './Input';

/**
 * ConfirmDialog supports both standard confirmation and typed confirmation for destructive actions.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary', // 'primary' | 'danger'
  requireText, // If provided, user must type this exact string
  requireTextPrompt,
  onConfirm,
  onClose,
  loading = false
}) {
  const [typedInput, setTypedInput] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTypedInput('');
      const handleKeyDown = (e) => {
        if (e.key === 'Escape' && !loading) {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const isConfirmedAllowed = requireText ? typedInput.trim() === requireText.trim() : true;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="modal-content" ref={dialogRef}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {tone === 'danger' && <AlertTriangle size={18} color="var(--danger)" aria-hidden="true" />}
            <h3 id="confirm-dialog-title" className="modal-title">
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            disabled={loading}
            aria-label="Close dialog"
            style={{ padding: 4, height: 28, width: 28, minHeight: 'unset', minWidth: 'unset' }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ marginBottom: requireText ? 16 : 0, color: 'var(--ink)' }}>{message}</p>

          {requireText && (
            <div style={{ marginTop: 12 }}>
              <Input
                label={requireTextPrompt || `To confirm, please type "${requireText}" below:`}
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                placeholder={requireText}
                autoFocus
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={!isConfirmedAllowed || loading}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}


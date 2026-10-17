import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import Button from './Button';

/**
 * Slide-over drawer panel for detailed side inspections.
 */
export default function Drawer({
  isOpen,
  title,
  subtitle,
  children,
  onClose,
  footer,
  width = 460
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      <div className="drawer-overlay" onClick={handleBackdropClick} aria-hidden="true" />
      <div
        className="drawer-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        style={{ maxWidth: typeof width === 'number' ? `${width}px` : width }}
      >
        <div className="drawer-header">
          <div>
            <h3 id="drawer-title" className="card-title">
              {title}
            </h3>
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            aria-label="Close drawer"
            style={{ padding: 4, height: 28, width: 28, minHeight: 'unset', minWidth: 'unset' }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="drawer-body">{children}</div>

        {footer && <div className="drawer-footer">{footer}</div>}
      </div>
    </>
  );
}


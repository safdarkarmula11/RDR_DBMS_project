import React, { createContext, useContext, useState, useCallback, useId } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { id, type: 'info', duration: 5000, ...toast };

    setToasts((prev) => [...prev, newToast]);

    if (newToast.duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, newToast.duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    show: (msg, opts) => addToast({ message: msg, ...opts }),
    success: (msg, opts) => addToast({ message: msg, type: 'success', ...opts }),
    error: (msg, opts) => addToast({ message: msg, type: 'error', ...opts }),
    warn: (msg, opts) => addToast({ message: msg, type: 'warn', ...opts }),
    info: (msg, opts) => addToast({ message: msg, type: 'info', ...opts }),
    dismiss: removeToast
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => {
          const Icon =
            t.type === 'success'
              ? CheckCircle
              : t.type === 'error'
              ? AlertCircle
              : t.type === 'warn'
              ? AlertTriangle
              : Info;

          const iconColor =
            t.type === 'success'
              ? 'var(--ok)'
              : t.type === 'error'
              ? 'var(--danger)'
              : t.type === 'warn'
              ? 'var(--warn)'
              : 'var(--brand)';

          return (
            <div key={t.id} className={`toast toast--${t.type}`} style={{ position: 'relative', overflow: 'hidden' }}>
              <Icon size={18} color={iconColor} aria-hidden="true" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {t.title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{t.title}</div>}
                <div>{t.message}</div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="btn btn--ghost btn--sm"
                style={{ padding: 2, height: 20, width: 20, minHeight: 'unset', minWidth: 'unset', marginLeft: 4 }}
                aria-label="Close notification"
              >
                <X size={14} aria-hidden="true" />
              </button>
              {t.duration > 0 && (
                <div
                  className="toast-progress-bar"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    height: 3,
                    background: iconColor,
                    animation: `toastProgressCountdown ${t.duration}ms linear forwards`,
                    borderBottomLeftRadius: 'var(--radius-sm)'
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}


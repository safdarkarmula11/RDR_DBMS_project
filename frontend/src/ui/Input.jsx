import React, { useId } from 'react';

/**
 * Accessible form field with label, optional hint, and inline error.
 */
export default function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  hint,
  required = false,
  disabled = false,
  as = 'input',
  children,
  className = '',
  id: explicitId,
  ...props
}) {
  const generatedId = useId();
  const id = explicitId || generatedId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const Component = as;

  return (
    <div className={`form-group ${className}`.trim()}>
      {label && (
        <label htmlFor={id} className="form-label">
          <span>
            {label}
            {required && <span className="required" aria-hidden="true">*</span>}
          </span>
        </label>
      )}

      <Component
        id={id}
        type={as === 'input' ? type : undefined}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-invalid={!!error}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
        className="input-element"
        {...props}
      >
        {children}
      </Component>

      {error && (
        <div id={errorId} className="input-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {hint && !error && (
        <div id={hintId} className="input-hint">
          {hint}
        </div>
      )}
    </div>
  );
}


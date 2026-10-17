import React from 'react';

/**
 * Button component with variants: primary, secondary, danger, ghost.
 * Only ONE primary button should be used per view.
 */
export default function Button({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  type = 'button',
  onClick,
  className = '',
  'aria-label': ariaLabel,
  ...props
}) {
  const variantClass = `btn--${variant}`;
  const sizeClass = size === 'sm' ? 'btn--sm' : size === 'lg' ? 'btn--lg' : '';

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={disabled || loading}
      aria-disabled={disabled || loading}
      aria-label={ariaLabel}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <>
          <span className="spinner" aria-hidden="true" />
          <span>{children}</span>
        </>
      ) : (
        <>
          {Icon && <Icon size={16} aria-hidden="true" />}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}


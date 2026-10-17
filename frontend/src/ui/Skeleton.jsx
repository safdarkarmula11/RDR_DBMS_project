import React from 'react';

/**
 * Skeleton loader component supporting rows, cards, circles, and custom dimensions.
 */
export default function Skeleton({
  variant = 'text',
  rows = 1,
  width,
  height,
  className = '',
  style = {}
}) {
  if (rows > 1) {
    return (
      <div className={`skeleton-group ${className}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height: height || 20,
              width: width || (i === rows - 1 ? '70%' : '100%'),
              ...style
            }}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  const defaultHeight = variant === 'card' ? 120 : variant === 'circle' ? 40 : 20;
  const defaultWidth = variant === 'circle' ? 40 : '100%';

  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={{
        height: height || defaultHeight,
        width: width || defaultWidth,
        borderRadius: variant === 'circle' ? '50%' : 'var(--radius-sm)',
        ...style
      }}
      aria-hidden="true"
    />
  );
}


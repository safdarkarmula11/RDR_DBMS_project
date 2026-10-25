import React from 'react';

/**
 * QuotaBar renders a linear progress indicator with WCAG 2.2 accessible attributes
 * and threshold color transitions (brand <80%, warn >=80%, danger >=95%).
 */
export default function QuotaBar({
  label,
  used = 0,
  total = 0,
  unit = '',
  className = ''
}) {
  const safeTotal = total > 0 ? total : 1;
  const pct = Math.min(100, Math.max(0, Math.round((used / safeTotal) * 100)));
  const tone = pct >= 95 ? 'danger' : pct >= 80 ? 'warn' : 'brand';

  const [animatedPct, setAnimatedPct] = React.useState(0);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedPct(pct);
    }, 60);
    return () => clearTimeout(timer);
  }, [pct]);

  const unitSuffix = unit ? ` ${unit}` : '';

  return (
    <div className={`quota-bar ${className}`.trim()}>
      <div className="quota-header">
        <span className="quota-header-title">{label}</span>
        <span className="quota-header-val">
          {used}{unitSuffix} / {total}{unitSuffix} ({pct}%)
        </span>
      </div>

      <div
        className="quota-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className={`quota-fill quota-fill--${tone}`}
          style={{ width: `${animatedPct}%` }}
        />
      </div>

      {pct >= 95 ? (
        <div className="quota-warning-text quota-danger">
          <span>Critical quota limit reached ({pct}%). Upgrades required for new resources.</span>
        </div>
      ) : pct >= 80 ? (
        <div className="quota-warning-text">
          <span>Approaching plan capacity limit ({pct}% used).</span>
        </div>
      ) : null}
    </div>
  );
}


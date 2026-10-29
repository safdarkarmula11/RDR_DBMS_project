import React from 'react';

/**
 * The NimbusHost logo exactly as in the application sidebar:
 * the lemon mark in a soft yellow badge, with the name beside it.
 * The lemon SVG is inlined so this file has no other dependencies.
 */
function Lemon({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nbLemonYellow" x1="6" y1="8" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="45%" stopColor="#FACC15" />
          <stop offset="100%" stopColor="#EAB308" />
        </linearGradient>
        <linearGradient id="nbLemonHighlight" x1="10" y1="10" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="nbLeaf" x1="16" y1="3" x2="24" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="100%" stopColor="#16A34A" />
        </linearGradient>
      </defs>
      <path d="M17 7C17.2 5.5 17.8 4.2 19 3.5" stroke="#65A30D" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M18 6.5C21.5 5 25 6 26 8.5C25.5 11 22.5 11.5 19 9.5C18.2 9 17.8 8 18 6.5Z"
        fill="url(#nbLeaf)"
      />
      <path
        d="M6.2 17.8C5.2 16.5 5.2 14.8 6.6 13C8.8 10.1 13.5 7.8 18.2 8.6C21.5 9.2 24.5 11.5 25.8 14.2C26.8 16.2 26.2 18.5 24.5 20.2C21.5 23.2 16.2 24.8 11.8 23.6C9.2 22.9 7.2 20.8 6.2 17.8Z"
        fill="url(#nbLemonYellow)"
        stroke="#CA8A04"
        strokeWidth="0.8"
      />
      <path d="M9 13.5C11 10.5 15 9.2 18 9.8" stroke="url(#nbLemonHighlight)" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="5.8" cy="15.8" rx="1" ry="0.7" transform="rotate(-30 5.8 15.8)" fill="#EAB308" />
      <ellipse cx="25.5" cy="16.5" rx="1" ry="0.7" transform="rotate(-20 25.5 16.5)" fill="#EAB308" />
    </svg>
  );
}

export default function NimbusLogo({ subtitle = true }) {
  return (
    <span className="nb-logo">
      <span className="nb-logo-icon">
        <Lemon size={22} />
      </span>
      <span className="nb-logo-text">
        <b>NimbusHost</b>
        {subtitle && <small>Cloud Management</small>}
      </span>
    </span>
  );
}
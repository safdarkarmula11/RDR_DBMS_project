import React from 'react';

/**
 * LemonLogo — Modern, minimalist vector yellow lemon logo.
 * Clean, iconic, and scalable with crisp geometry and a fresh leaf.
 */
export default function LemonLogo({ size = 20, className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      aria-label="NimbusHost Lemon Logo"
    >
      <defs>
        {/* Lemon yellow gradient */}
        <linearGradient id="lemonYellowGrad" x1="6" y1="8" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="45%" stopColor="#FACC15" />
          <stop offset="100%" stopColor="#EAB308" />
        </linearGradient>

        {/* Lemon highlight */}
        <linearGradient id="lemonHighlight" x1="10" y1="10" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        {/* Fresh green leaf gradient */}
        <linearGradient id="leafGrad" x1="16" y1="3" x2="24" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="100%" stopColor="#16A34A" />
        </linearGradient>
      </defs>

      {/* Lemon Stem */}
      <path
        d="M17 7C17.2 5.5 17.8 4.2 19 3.5"
        stroke="#65A30D"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Fresh Green Leaf */}
      <path
        d="M18 6.5C21.5 5 25 6 26 8.5C25.5 11 22.5 11.5 19 9.5C18.2 9 17.8 8 18 6.5Z"
        fill="url(#leafGrad)"
      />

      {/* Main Lemon Body (pointed oval tilted at -25deg) */}
      <path
        d="M6.2 17.8C5.2 16.5 5.2 14.8 6.6 13C8.8 10.1 13.5 7.8 18.2 8.6C21.5 9.2 24.5 11.5 25.8 14.2C26.8 16.2 26.2 18.5 24.5 20.2C21.5 23.2 16.2 24.8 11.8 23.6C9.2 22.9 7.2 20.8 6.2 17.8Z"
        fill="url(#lemonYellowGrad)"
        stroke="#CA8A04"
        strokeWidth="0.8"
      />

      {/* Subtle Lemon highlight curve */}
      <path
        d="M9 13.5C11 10.5 15 9.2 18 9.8"
        stroke="url(#lemonHighlight)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Lemon tip nipple left */}
      <ellipse
        cx="5.8"
        cy="15.8"
        rx="1"
        ry="0.7"
        transform="rotate(-30 5.8 15.8)"
        fill="#EAB308"
      />

      {/* Lemon tip nipple right */}
      <ellipse
        cx="25.5"
        cy="16.5"
        rx="1"
        ry="0.7"
        transform="rotate(-20 25.5 16.5)"
        fill="#EAB308"
      />
    </svg>
  );
}


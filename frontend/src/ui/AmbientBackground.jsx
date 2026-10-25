import React from 'react';

/**
 * AmbientBackground — subtle, slowly drifting color blobs
 * GPU-friendly: transform + opacity only, will-change: transform
 * Hidden for prefers-reduced-motion and screens < 400px (CSS)
 */
export default function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <div className="ambient-bg__blob" />
      <div className="ambient-bg__blob" />
      <div className="ambient-bg__blob" />
    </div>
  );
}


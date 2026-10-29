import React, { useEffect, useRef, useState } from 'react';

/**
 * Hosts the Three.js canvas. three.js is loaded lazily, so it only affects
 * the landing page and never the rest of the application bundle.
 * If WebGL is unavailable (or the scene fails), a CSS-only fallback is shown.
 */
export default function DatabaseScene({ apiRef, onReady }) {
  const canvasRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let api = null;

    import('./sceneCore')
      .then(({ initScene }) => {
        if (cancelled || !canvasRef.current) return;
        const mobile =
          window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
          api = initScene(canvasRef.current, { mobile, reduced });
          apiRef.current = api;
          canvasRef.current.classList.add('is-ready');
          if (onReady) onReady(api);
        } catch (err) {
          console.warn('3D scene unavailable, using fallback:', err);
          setFailed(true);
        }
      })
      .catch((err) => {
        console.warn('Could not load 3D scene, using fallback:', err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (api) api.dispose();
      if (apiRef.current === api) apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef]);

  if (failed) {
    return (
      <div className="cin-fallback" aria-hidden="true">
        <span className="cin-fallback-ring r1" />
        <span className="cin-fallback-ring r2" />
        <span className="cin-fallback-ring r3" />
        <span className="cin-fallback-core" />
      </div>
    );
  }
  return <canvas ref={canvasRef} className="cin-canvas" aria-hidden="true" />;
}
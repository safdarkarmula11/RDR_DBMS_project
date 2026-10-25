import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { INTRO_CONFIG } from './introConfig';
import LemonLogo from '../ui/LemonLogo';

export default function Preloader({ onComplete, force = false }) {
  const [progress, setProgress] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const containerRef = useRef(null);
  const svgRef = useRef(null);

  useEffect(() => {
    // Check if user already saw the intro this session (can be bypassed with force=true)
    const alreadySeen = sessionStorage.getItem(INTRO_CONFIG.preloader.sessionKey);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Only skip if already seen and not forced, or if reduced motion is preferred
    if (alreadySeen && !force) {
      setIsDone(true);
      if (onComplete) onComplete();
      return;
    }

    // Set initial stroke dasharray & offset on all SVG paths for reliable drawing
    const paths = svgRef.current?.querySelectorAll('.preloader-draw-path');
    if (paths?.length) {
      paths.forEach((path) => {
        const len = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 250;
        gsap.set(path, {
          strokeDasharray: len,
          strokeDashoffset: len,
        });
      });

      // Animate SVG path drawing with GSAP
      gsap.to(paths, {
        strokeDashoffset: 0,
        duration: 1.6,
        ease: 'power2.out',
        stagger: 0.08,
      });
    }

    const duration = prefersReducedMotion ? 600 : INTRO_CONFIG.preloader.durationMs;
    const intervalTime = 20;
    const increment = 100 / (duration / intervalTime);

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          finishPreloader();
          return 100;
        }
        return next;
      });
    }, intervalTime);

    // Keyboard listener for Escape key to skip
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        skipPreloader();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [force]);

  const finishPreloader = () => {
    setIsFading(true);
    sessionStorage.setItem(INTRO_CONFIG.preloader.sessionKey, 'true');
    setTimeout(() => {
      setIsDone(true);
      if (onComplete) onComplete();
    }, 450);
  };

  const skipPreloader = () => {
    finishPreloader();
  };

  if (isDone) return null;

  return (
    <div
      ref={containerRef}
      className={`intro-preloader ${isFading ? 'fade-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="NimbusHost cluster loading sequence"
    >
      <div className="preloader-visual">
        <svg
          ref={svgRef}
          className="preloader-svg"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Hexagonal boundary cluster */}
          <polygon
            points="50,6 88,28 88,72 50,94 12,72 12,28"
            stroke="rgba(14, 124, 106, 0.4)"
            strokeWidth="1.5"
            fill="rgba(11, 27, 58, 0.45)"
            className="preloader-draw-path"
          />

          {/* Animated Database cylinder paths */}
          <ellipse
            cx="50"
            cy="28"
            rx="22"
            ry="8"
            stroke="url(#preloaderGrad)"
            strokeWidth="2.5"
            className="preloader-draw-path"
          />
          <path
            d="M28,28 C28,37 72,37 72,28"
            stroke="url(#preloaderGrad)"
            strokeWidth="2.5"
            fill="none"
            className="preloader-draw-path"
          />
          <path
            d="M28,45 C28,54 72,54 72,45"
            stroke="url(#preloaderGrad)"
            strokeWidth="2.5"
            fill="none"
            className="preloader-draw-path"
          />
          <path
            d="M28,62 C28,71 72,71 72,62"
            stroke="url(#preloaderGrad)"
            strokeWidth="2.5"
            fill="none"
            className="preloader-draw-path"
          />
          <path
            d="M28,28 L28,62"
            stroke="url(#preloaderGrad)"
            strokeWidth="2.5"
            className="preloader-draw-path"
          />
          <path
            d="M72,28 L72,62"
            stroke="url(#preloaderGrad)"
            strokeWidth="2.5"
            className="preloader-draw-path"
          />

          {/* Central sync pulse */}
          <circle
            cx="50"
            cy="45"
            r="4.5"
            fill="#38BDF8"
            style={{
              filter: 'drop-shadow(0 0 10px #38BDF8)',
              opacity: progress > 30 ? 1 : progress / 30,
              transition: 'opacity 0.2s',
            }}
          />

          <defs>
            <linearGradient id="preloaderGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1E60F2" />
              <stop offset="0.5" stopColor="#3B82F6" />
              <stop offset="1" stopColor="#38BDF8" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="preloader-progress-box">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
          <LemonLogo size={22} />
          <span>{INTRO_CONFIG.preloader.title}</span>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.65)' }}>
          {INTRO_CONFIG.preloader.subtitle}
        </div>

        <div className="preloader-bar-bg">
          <div className="preloader-bar-fill" style={{ width: `${Math.round(progress)}%` }} />
        </div>

        <div className="preloader-counter">
          {Math.min(100, Math.round(progress))}% INITIALIZED
        </div>
      </div>

      <button
        type="button"
        className="preloader-skip-btn"
        onClick={skipPreloader}
        title="Press Esc to Skip"
      >
        Skip intro (Esc)
      </button>
    </div>
  );
}

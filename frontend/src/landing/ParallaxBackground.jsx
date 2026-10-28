import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { INTRO_CONFIG } from './introConfig';

gsap.registerPlugin(ScrollTrigger);

export default function ParallaxBackground() {
  const containerRef = useRef(null);
  const layer1Ref = useRef(null);
  const layer2Ref = useRef(null);
  const layer3Ref = useRef(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      // Layer 1: Background Blueprint Grid & Glow
      gsap.to(layer1Ref.current, {
        y: () => window.innerHeight * INTRO_CONFIG.parallax.gridSpeed,
        ease: 'none',
        scrollTrigger: {
          trigger: document.body,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1,
        },
      });

      // Layer 2: Midground Data Node Cluster
      gsap.to(layer2Ref.current, {
        y: () => window.innerHeight * INTRO_CONFIG.parallax.nodesSpeed,
        ease: 'none',
        scrollTrigger: {
          trigger: document.body,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1.2,
        },
      });

      // Layer 3: Foreground HUD Floating Markers
      gsap.to(layer3Ref.current, {
        y: () => window.innerHeight * INTRO_CONFIG.parallax.hudSpeed,
        ease: 'none',
        scrollTrigger: {
          trigger: document.body,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1.4,
        },
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="parallax-canvas" aria-hidden="true">
      {/* Depth Layer 1: Deep Blueprint Grid & Ambient Nebular Glow */}
      <div ref={layer1Ref} className="parallax-layer parallax-layer-grid">
        <div className="parallax-glow parallax-glow-1" />
        <div className="parallax-glow parallax-glow-2" />
      </div>

      {/* Depth Layer 2: Midground Particle Mesh & Cluster Vectors */}
      <div ref={layer2Ref} className="parallax-layer">
        <svg
          style={{ width: '100%', height: '100%', opacity: 0.3 }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <g stroke="rgba(59, 130, 246, 0.25)" strokeWidth="1">
            <line x1="15%" y1="20%" x2="35%" y2="40%" />
            <line x1="35%" y1="40%" x2="65%" y2="25%" />
            <line x1="65%" y1="25%" x2="85%" y2="55%" />
            <line x1="20%" y1="65%" x2="45%" y2="80%" />
            <line x1="45%" y1="80%" x2="75%" y2="70%" />
          </g>
          <circle cx="15%" cy="20%" r="3" fill="#1E60F2" />
          <circle cx="35%" cy="40%" r="4" fill="#38BDF8" />
          <circle cx="65%" cy="25%" r="3" fill="#3B82F6" />
          <circle cx="85%" cy="55%" r="4" fill="#0284C7" />
          <circle cx="20%" cy="65%" r="3" fill="#38BDF8" />
          <circle cx="45%" cy="80%" r="4" fill="#1E60F2" />
          <circle cx="75%" cy="70%" r="3" fill="#3B82F6" />
        </svg>
      </div>

      {/* Depth Layer 3: Foreground Telemetry Markers */}
      <div ref={layer3Ref} className="parallax-layer" style={{ pointerEvents: 'none' }}>
        <div
          className="mono"
          style={{
            position: 'absolute',
            top: '25%',
            left: '16%',
            fontSize: '10px',
            color: 'rgba(59, 130, 246, 0.4)',
            letterSpacing: '1px',
          }}
        >
          SYS.NODE // 0x4B92 · LATENCY 0.8ms
        </div>
        <div
          className="mono"
          style={{
            position: 'absolute',
            top: '55%',
            right: '17%',
            fontSize: '10px',
            color: 'rgba(56, 189, 248, 0.4)',
            letterSpacing: '1px',
          }}
        >
          REPLICATION // INNODB 8.0 · 4 REGIONS SYNCED
        </div>
        <div
          className="mono"
          style={{
            position: 'absolute',
            bottom: '20%',
            left: '19%',
            fontSize: '10px',
            color: 'rgba(16, 185, 129, 0.4)',
            letterSpacing: '1px',
          }}
        >
          TENANT_ISOLATION // ACTIVE (PVE-CLUSTER)
        </div>
      </div>
    </div>
  );
}
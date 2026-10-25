import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { INTRO_CONFIG } from './introConfig';
import { Activity, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

gsap.registerPlugin(ScrollTrigger);

export default function HeroScene() {
  const trackRef = useRef(null);
  const viewportRef = useRef(null);
  const headlineRef = useRef(null);
  const collageRef = useRef(null);
  const centerMonolithRef = useRef(null);
  const panelTopRightRef = useRef(null);
  const panelTopLeftRef = useRef(null);
  const panelBottomRightRef = useRef(null);
  const panelBottomLeftRef = useRef(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = gsap.context(() => {
      // 1. INITIAL MOUNT ENTRANCE ANIMATION
      const introTl = gsap.timeline({ defaults: { ease: 'power2.out' } });

      introTl
        .fromTo(
          headlineRef.current,
          { opacity: 0, y: 30, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 1.0, delay: 0.15 }
        )
        .fromTo(
          centerMonolithRef.current,
          { opacity: 0, scale: 0.85 },
          { opacity: 1, scale: 1, duration: 1.2, ease: 'back.out(1.3)' },
          '-=0.7'
        )
        .fromTo(
          [panelTopRightRef.current, panelTopLeftRef.current, panelBottomRightRef.current, panelBottomLeftRef.current],
          { opacity: 0, scale: 0.75, y: 20 },
          { opacity: 1, scale: 1, y: 0, duration: 1.0, stagger: 0.08, ease: 'power2.out' },
          '-=0.8'
        );

      if (prefersReducedMotion) return;

      // 2. SCROLL-DRIVEN ZOOM-IN SCRUB TIMELINE
      // As the user scrolls, the camera zooms into the background collage!
      // The central monolith dives in while surrounding collage panels drift outward.
      const scrubTl = gsap.timeline({
        scrollTrigger: {
          trigger: trackRef.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: INTRO_CONFIG.hero.scrubSmoothness || 1.0,
          pin: viewportRef.current,
          anticipatePin: 1,
        },
      });

      // Phase 1: Headline fades up & out early so the visual takes full center stage
      scrubTl.to(
        headlineRef.current,
        {
          opacity: 0,
          y: -50,
          scale: 0.95,
          duration: 1.2,
          ease: 'power2.in',
        },
        0
      );

      // Phase 2: Central Monolith ZOOMS IN towards the viewer (Camera dive into core)
      scrubTl.to(
        centerMonolithRef.current,
        {
          scale: 2.8,
          y: 30,
          duration: 3.5,
          ease: 'power1.inOut',
        },
        0.2
      );

      // Phase 3: Surrounding collage panels expand outwards in 3D perspective
      scrubTl.to(
        panelTopRightRef.current,
        {
          x: 180,
          y: -120,
          scale: 1.35,
          opacity: 0.35,
          duration: 3.2,
          ease: 'power1.inOut',
        },
        0.3
      );

      scrubTl.to(
        panelTopLeftRef.current,
        {
          x: -180,
          y: -110,
          scale: 1.3,
          opacity: 0.35,
          duration: 3.2,
          ease: 'power1.inOut',
        },
        0.3
      );

      scrubTl.to(
        panelBottomRightRef.current,
        {
          x: 160,
          y: 120,
          scale: 1.25,
          opacity: 0.3,
          duration: 3.2,
          ease: 'power1.inOut',
        },
        0.4
      );

      scrubTl.to(
        panelBottomLeftRef.current,
        {
          x: -160,
          y: 110,
          scale: 1.25,
          opacity: 0.3,
          duration: 3.2,
          ease: 'power1.inOut',
        },
        0.4
      );

      // Phase 4: Final deep dive into the luminous core
      scrubTl.to(
        centerMonolithRef.current,
        {
          scale: 3.8,
          opacity: 0.85,
          duration: 1.5,
          ease: 'power1.out',
        },
        3.5
      );
    }, trackRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={trackRef} className="hero-scroll-track" style={{ height: INTRO_CONFIG.hero.pinDistance || '350vh' }}>
      <div ref={viewportRef} className="hero-pinned-viewport">
        {/* Scroll indicator prompt */}
        <div className="hero-scroll-prompt" aria-hidden="true">
          <span>Scroll to Zoom Into Cloud Architecture</span>
          <div className="hero-scroll-mouse">
            <div className="hero-scroll-wheel" />
          </div>
        </div>

        <div className="hero-stage-container">
          {/* Main Clean Headline (No clutter, fades smoothly on scroll) */}
          <div ref={headlineRef} className="hero-headline-wrap">
            <div className="hero-badge-pill">
              <Activity size={14} className="badge-pulse-icon" />
              <span>ACID-Consistent Cloud Management</span>
            </div>
            <h1 className="hero-title">
              From Raw Data Points to Distributed Cloud Tiers
            </h1>
            <p className="hero-subtitle">
              High-performance compute hypervisors, isolated customer VPCs, and real-time telemetry
              with guaranteed transaction serializability.
            </p>
            <div className="hero-actions-row">
              <Link to="/register" className="btn btn--primary btn--lg">
                <span>Deploy Compute Node</span>
                <ArrowRight size={15} />
              </Link>
              <Link to="/login" className="btn btn--secondary btn--lg">
                <span>Sign In to Console</span>
              </Link>
            </div>
          </div>

          {/* ── BACKGROUND COLLAGE (Unobstructed, Animated & Zooming in) ── */}
          <div ref={collageRef} className="hero-collage-container" aria-hidden="true">
            {/* Centerpiece: Primary 3D Sci-Fi Monolith */}
            <div ref={centerMonolithRef} className="collage-item collage-centerpiece">
              <div className="collage-monolith-glow" />
              <img
                src="/hero-monolith.png"
                alt="Cloud Core Monolith"
                className="collage-img collage-img-main"
              />
            </div>

            {/* Top-Right Panel: Server Infrastructure */}
            <div ref={panelTopRightRef} className="collage-item collage-panel-top-right">
              <div className="collage-card-frame">
                <img
                  src="/landing-server-illustration.png"
                  alt="Server Cluster"
                  className="collage-img"
                />
              </div>
            </div>

            {/* Top-Left Panel: Cloud Fabric */}
            <div ref={panelTopLeftRef} className="collage-item collage-panel-top-left">
              <div className="collage-card-frame">
                <img
                  src="/landing-cloud-illustration.png"
                  alt="Virtual Cloud Fabric"
                  className="collage-img"
                />
              </div>
            </div>

            {/* Bottom-Right Panel: Operations & Teams */}
            <div ref={panelBottomRightRef} className="collage-item collage-panel-bottom-right">
              <div className="collage-card-frame">
                <img
                  src="/landing-team-illustration.png"
                  alt="Multi-Tenant Teams"
                  className="collage-img"
                />
              </div>
            </div>

            {/* Bottom-Left Panel: Satellite Monolith Angle */}
            <div ref={panelBottomLeftRef} className="collage-item collage-panel-bottom-left">
              <div className="collage-card-frame">
                <img
                  src="/hero-monolith.png"
                  alt="Storage Fabric"
                  className="collage-img collage-img-satellite"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

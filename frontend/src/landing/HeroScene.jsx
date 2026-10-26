import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { INTRO_CONFIG } from './introConfig';
import { Activity, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

gsap.registerPlugin(ScrollTrigger);

export default function HeroScene() {
  const trackRef = useRef(null);
  const viewportRef = useRef(null);
  const headlineRef = useRef(null);

  // 6 Non-overlapping Collage Cards taking entire screen perimeter
  const cardTlRef = useRef(null);
  const cardTrRef = useRef(null);
  const cardMlRef = useRef(null);
  const cardMrRef = useRef(null);
  const cardBlRef = useRef(null);
  const cardBrRef = useRef(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = gsap.context(() => {
      // 1. INITIAL MOUNT ENTRANCE ANIMATION
      const introTl = gsap.timeline({ defaults: { ease: 'power2.out' } });

      introTl
        .fromTo(
          headlineRef.current,
          { opacity: 0, y: 25, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.9, delay: 0.1 }
        )
        .fromTo(
          [
            cardTlRef.current,
            cardTrRef.current,
            cardMlRef.current,
            cardMrRef.current,
            cardBlRef.current,
            cardBrRef.current,
          ],
          { opacity: 0, scale: 0.88, y: 20 },
          { opacity: 1, scale: 1, y: 0, duration: 0.85, stagger: 0.08, ease: 'back.out(1.2)' },
          '-=0.6'
        );

      if (prefersReducedMotion) return;

      // 2. SCROLL-DRIVEN PARALLAX (FULL SCREEN COLLAGE)
      // As the user scrolls, headline fades and perimeter cards drift smoothly in 3D perspective
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

      // Headline fades out gently as the user scrolls
      scrubTl.to(
        headlineRef.current,
        {
          opacity: 0,
          y: -40,
          scale: 0.96,
          duration: 1.0,
          ease: 'power2.in',
        },
        0
      );

      // Top cards drift upward
      scrubTl.to(
        [cardTlRef.current, cardTrRef.current],
        {
          y: -50,
          opacity: 0.25,
          duration: 1.8,
          ease: 'power1.out',
        },
        0.1
      );

      // Mid cards drift outward
      scrubTl.to(
        cardMlRef.current,
        {
          x: -30,
          opacity: 0.25,
          duration: 1.8,
          ease: 'power1.out',
        },
        0.12
      );

      scrubTl.to(
        cardMrRef.current,
        {
          x: 30,
          opacity: 0.25,
          duration: 1.8,
          ease: 'power1.out',
        },
        0.12
      );

      // Bottom cards drift downward
      scrubTl.to(
        [cardBlRef.current, cardBrRef.current],
        {
          y: 50,
          opacity: 0.25,
          duration: 1.8,
          ease: 'power1.out',
        },
        0.15
      );
    }, trackRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={trackRef}
      className="hero-scroll-track"
      style={{ height: INTRO_CONFIG.hero.pinDistance || '220vh' }}
    >
      <div ref={viewportRef} className="hero-pinned-viewport">
        {/* ── BACKGROUND COLLAGE (Takes Entire Screen, Zero Overlap) ── */}
        <div className="hero-collage-container" aria-hidden="true">
          {/* Subtle Ambient Radial Glow */}
          <div className="collage-ambient-glow" />

          {/* 1. Top-Left: Cloud Hosting Digital Server Technology */}
          <div ref={cardTlRef} className="collage-card collage-card-tl">
            <div className="collage-card-inner">
              <div className="collage-card-header">
                <span className="collage-dot" style={{ background: '#38BDF8' }} />
                <span className="collage-label">Cloud Hosting Mesh</span>
                <span className="collage-tag">vCPU</span>
              </div>
              <div className="collage-img-wrap">
                <img
                  src="/landing-cloud-hosting.png"
                  alt="Cloud Hosting Digital Server Technology"
                  className="collage-img"
                />
              </div>
            </div>
          </div>

          {/* 2. Top-Right: Bare-Metal Hypervisors & Terminal */}
          <div ref={cardTrRef} className="collage-card collage-card-tr">
            <div className="collage-card-inner">
              <div className="collage-card-header">
                <span className="collage-dot" style={{ background: '#A855F7' }} />
                <span className="collage-label">Bare-Metal Hypervisors</span>
                <span className="collage-tag">Cluster</span>
              </div>
              <div className="collage-img-wrap">
                <img
                  src="/landing-server-purple.png"
                  alt="Bare-Metal Hypervisors & Terminal"
                  className="collage-img"
                />
              </div>
            </div>
          </div>

          {/* 3. Mid-Left: Zero-Trust Security & Network Shield */}
          <div ref={cardMlRef} className="collage-card collage-card-ml">
            <div className="collage-card-inner">
              <div className="collage-card-header">
                <span className="collage-dot" style={{ background: '#06B6D4' }} />
                <span className="collage-label">Zero-Trust Shield</span>
                <span className="collage-tag">256-bit</span>
              </div>
              <div className="collage-img-wrap">
                <img
                  src="/landing-security-lock.png"
                  alt="Zero-Trust Security & Network Shield"
                  className="collage-img"
                />
              </div>
            </div>
          </div>

          {/* 4. Mid-Right: Virtual Private Cloud (VPC) Topology */}
          <div ref={cardMrRef} className="collage-card collage-card-mr">
            <div className="collage-card-inner">
              <div className="collage-card-header">
                <span className="collage-dot" style={{ background: '#3B82F6' }} />
                <span className="collage-label">Virtual Private Cloud</span>
                <span className="collage-tag">VPC</span>
              </div>
              <div className="collage-img-wrap">
                <img
                  src="/landing-cloud-illustration.png"
                  alt="Virtual Private Cloud"
                  className="collage-img"
                />
              </div>
            </div>
          </div>

          {/* 5. Bottom-Left: Autonomous Compute Engine */}
          <div ref={cardBlRef} className="collage-card collage-card-bl">
            <div className="collage-card-inner">
              <div className="collage-card-header">
                <span className="collage-dot" style={{ background: '#F59E0B' }} />
                <span className="collage-label">Autonomous Compute Mesh</span>
                <span className="collage-tag">Mesh</span>
              </div>
              <div className="collage-img-wrap collage-img-wrap-monolith">
                <img
                  src="/hero-monolith.png"
                  alt="Autonomous Compute Mesh"
                  className="collage-img collage-img-contain"
                />
              </div>
            </div>
          </div>

          {/* 6. Bottom-Right: Multi-Tenant IAM & Teams */}
          <div ref={cardBrRef} className="collage-card collage-card-br">
            <div className="collage-card-inner">
              <div className="collage-card-header">
                <span className="collage-dot" style={{ background: '#10B981' }} />
                <span className="collage-label">Multi-Tenant IAM</span>
                <span className="collage-tag">RBAC</span>
              </div>
              <div className="collage-img-wrap">
                <img
                  src="/landing-team-illustration.png"
                  alt="Multi-Tenant IAM & Teams"
                  className="collage-img"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Center Stage Headline (Elevated, Unobstructed, 100% Readable) */}
        <div className="hero-stage-container">
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
        </div>

        {/* Scroll indicator prompt */}
        <div className="hero-scroll-prompt" aria-hidden="true">
          <span>Scroll to Explore Architecture</span>
          <div className="hero-scroll-mouse">
            <div className="hero-scroll-wheel" />
          </div>
        </div>
      </div>
    </section>
  );
}

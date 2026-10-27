import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useSmoothScroll } from './useSmoothScroll';
import Preloader from './Preloader';
import ParallaxBackground from './ParallaxBackground';
import HeroScene from './HeroScene';
import PinnedFeatures from './PinnedFeatures';
import { ArrowRight, Shield, Database, Terminal, LogIn, RotateCcw, Moon, Sun } from 'lucide-react';
import LemonLogo from '../ui/LemonLogo';
import '../styles/landing.css';

export default function LandingPage() {
  const { user } = useAuth();
  const [preloaderDone, setPreloaderDone] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Initialize Lenis + ScrollTrigger sync
  useSmoothScroll({ enabled: preloaderDone });

  const handleReplayIntro = (e) => {
    e.preventDefault();
    sessionStorage.removeItem('nimbus_intro_seen');
    setPreloaderDone(false);
    setReplayKey((k) => k + 1);
  };

  return (
    <div className="landing-root">
      {/* 1. Preloader Animation (skippable, 2s, skippable with Esc or button) */}
      <Preloader key={replayKey} force={replayKey > 0} onComplete={() => setPreloaderDone(true)} />

      {/* 2. Fixed Topbar Navigation */}
      <header className="landing-nav" role="banner">
        <Link to="/" className="landing-brand" aria-label="NimbusHost Home">
          <div className="landing-brand-logo">
            <LemonLogo size={24} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="landing-brand-name">NimbusHost</span>
            <span className="landing-brand-badge">Cloud Engine</span>
          </div>
        </Link>

        <nav className="landing-nav-actions" aria-label="Main Navigation">
          {/* Theme Toggle (Blue & White vs Blue & Black) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="landing-nav-link nav-optional"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title={`Switch to ${theme === 'light' ? 'Dark Mode (Blue & Black)' : 'Light Mode (Blue & White)'}`}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} color="#38BDF8" />}
            <span>{theme === 'light' ? 'Blue & Black' : 'Blue & White'}</span>
          </button>

          {/* Replay Intro button */}
          <button
            type="button"
            onClick={handleReplayIntro}
            className="landing-nav-link nav-optional"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Replay intro startup animation"
          >
            <RotateCcw size={14} />
            <span>Replay Intro</span>
          </button>

          {user ? (
            <Link to="/dashboard" className="landing-cta-btn">
              <span>Go to Console</span>
              <ArrowRight size={15} />
            </Link>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link to="/login" className="landing-nav-link" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LogIn size={15} />
                <span>Sign In</span>
              </Link>
              <Link to="/register" className="landing-cta-btn">
                <span>Deploy Free</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </nav>
      </header>

      {/* 3. Parallax 3-Depth Background */}
      <ParallaxBackground />

      {/* 4. Main Scroll Sequence */}
      <main id="main-content" tabIndex="-1">
        {/* Pinned & Zoom-In Hero Sequence with User Monolith Image */}
        <HeroScene />

        {/* Pinned Architecture Features (Scalability, Security, Recovery) */}
        <PinnedFeatures />
      </main>

      {/* 5. Modern Landing Footer & Console Launch Handoff */}
      <footer className="landing-footer" role="contentinfo">
        <div className="footer-cta-card">
          <h2 className="footer-cta-title">
            Ready to Launch Your Cloud Infrastructure?
          </h2>
          <p className="footer-cta-description">
            Deterministic transactions, sub-second provisioning, and guaranteed ACID consistency across all regions.
          </p>
          <div className="footer-cta-actions">
            <Link to="/register" className="landing-cta-btn footer-cta-link">
              <span>Get Started with NimbusHost</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        <button type="button" onClick={handleReplayIntro} className="footer-replay-btn">
          <RotateCcw size={14} />
          <span>Replay Intro Animation</span>
        </button>

        <div className="footer-text">
          NimbusHost Cloud Management Engine · Course AI203 DBMS Project
        </div>
      </footer>
    </div>
  );
}
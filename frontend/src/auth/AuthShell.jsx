import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import DatabaseScene from '../landing/DatabaseScene';
import NimbusLogo from '../landing/NimbusLogo';
import '../styles/landing-cinematic.css';
import '../styles/auth-cinematic.css';

// Where the 3D database sits behind the page. On narrow screens it stays centred and dimmer.
const WIDE = { x: -3.1, z: 9.4, shell: 0.22, spin: 0.16, glow: 0.55 };
const NARROW = { x: 0, z: 13, shell: 0.12, spin: 0.12, glow: 0.22 };

/**
 * Shared layout for the sign-in and sign-up pages:
 * the cinematic 3D database on the left, the form card on the right.
 */
export default function AuthShell({ docTitle, eyebrow, headline, lead, points = [], morph = 0.3, children }) {
  const sceneApi = useRef(null);

  const aim = () => {
    const narrow = window.matchMedia('(max-width: 900px)').matches;
    sceneApi.current?.setTarget({ ...(narrow ? NARROW : WIDE), morph });
  };

  useEffect(() => {
    const prev = document.title;
    document.title = docTitle;
    return () => {
      document.title = prev;
    };
  }, [docTitle]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    mq.addEventListener('change', aim);
    return () => mq.removeEventListener('change', aim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morph]);

  return (
    <div className="cin-root au-root">
      <DatabaseScene apiRef={sceneApi} onReady={aim} />
      <div className="cin-vignette" aria-hidden="true" />
      <div className="cin-grain" aria-hidden="true" />

      <section className="au-left">
        <div className="au-top">
          <Link to="/" className="cin-brand" aria-label="NimbusHost home">
            <NimbusLogo />
          </Link>
          <Link to="/" className="au-back">
            <ArrowLeft size={14} />
            Back to home
          </Link>
        </div>

        <div className="au-story">
          <p className="cin-eyebrow au-eyebrow">
            <span className="cin-eyebrow-dot" aria-hidden="true" />
            <em>{eyebrow}</em>
            <span className="cin-eyebrow-tag">AI203</span>
          </p>
          <h1 className="au-h1">{headline}</h1>
          <p className="au-lead">{lead}</p>
          <ul className="au-points">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="au-right">{children}</section>
    </div>
  );
}
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { HOME } from '../nav';
import { useSmoothScroll } from './useSmoothScroll';
import DatabaseScene from './DatabaseScene';
import '../styles/landing-cinematic.css';

gsap.registerPlugin(ScrollTrigger);

// Camera / scene state per story section. On narrow screens the scene stays centred.
const SCENES = {
  hero: { x: 0, z: 9.2, morph: 0, shell: 0.14, spin: 0.12, glow: 0.5 },
  schema: { x: 2.7, z: 8.2, morph: 1, shell: 0.05, spin: 0.04, glow: 0.3 },
  guard: { x: -2.7, z: 8.4, morph: 0, shell: 0.34, spin: 0.3, glow: 0.6 },
  billing: { x: 2.7, z: 7.4, morph: 0.45, shell: 0.16, spin: 0.2, glow: 0.45 },
  final: { x: 0, z: 10.6, morph: 0, shell: 0.22, spin: 0.16, glow: 0.65 },
};

const STORY = [
  {
    id: 'schema',
    index: '01',
    label: 'Schema',
    nav: 'Architecture',
    side: 'left',
    title: '35 tables. One source of truth.',
    body:
      'Organizations, instances, volumes, invoices, usage, tickets and an analytics star schema, normalized to 3NF and joined by 38 foreign keys with deliberate delete rules.',
    points: ['3NF and BCNF design', '38 foreign keys', 'Monthly-partitioned metering'],
  },
  {
    id: 'guard',
    index: '02',
    label: 'Guard',
    nav: 'Integrity',
    side: 'right',
    title: '79 triggers stand between your data and a mistake.',
    body:
      'Quotas, host capacity, status transitions and immutable payments are enforced inside MySQL, so the rules still hold if someone bypasses the API.',
    points: ['Enforced state machines', 'Append-only audit log', 'Tenant-scoped views'],
  },
  {
    id: 'billing',
    index: '03',
    label: 'Billing',
    nav: 'Billing Engine',
    side: 'left',
    title: 'Metered every minute. Billed by the book.',
    body:
      'Usage lands in a partitioned table, is priced from a dated price history and becomes invoices with tax and credit, driven by stored procedures and scheduled events.',
    points: ['Temporal pricing', '27 stored procedures', '7 scheduled events'],
  },
];

const STATS = [
  { value: 35, label: 'Tables' },
  { value: 27, label: 'Procedures' },
  { value: 79, label: 'Triggers' },
  { value: 25, label: 'Views' },
  { value: 20, label: 'Reports' },
];

function Words({ text }) {
  return text.split(' ').map((w, i) => (
    <React.Fragment key={`${w}-${i}`}>
      <span className="cin-w">
        <span className="cin-wi">{w}</span>
      </span>{' '}
    </React.Fragment>
  ));
}

function Magnetic({ to, className, children }) {
  const ref = useRef(null);
  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    gsap.to(el, { x: dx * 0.22, y: dy * 0.3, duration: 0.35, ease: 'power3.out', overwrite: 'auto' });
  };
  const onLeave = () => {
    gsap.to(ref.current, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
  };
  return (
    <Link ref={ref} to={to} className={className} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </Link>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const rootRef = useRef(null);
  const sceneApi = useRef(null);
  const currentScene = useRef('hero');
  const [active, setActive] = useState('hero');
  const lenisRef = useSmoothScroll({ enabled: true });

  // The real application entry: role home when signed in, otherwise the login screen.
  const launchTo = user ? HOME[user.role] || '/dashboard' : '/login';

  const goScene = (key) => {
    currentScene.current = key;
    const base = SCENES[key];
    const narrow = window.matchMedia('(max-width: 900px)').matches;
    sceneApi.current?.setTarget(narrow ? { ...base, x: 0, z: base.z + 1.6 } : base);
  };

  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      // Scene follows the story section that is in view.
      gsap.utils.toArray('[data-scene]').forEach((sec) => {
        ScrollTrigger.create({
          trigger: sec,
          start: 'top 55%',
          end: 'bottom 55%',
          onEnter: () => {
            goScene(sec.dataset.scene);
            setActive(sec.dataset.scene);
          },
          onEnterBack: () => {
            goScene(sec.dataset.scene);
            setActive(sec.dataset.scene);
          },
        });
      });

      // Animated counters
      gsap.utils.toArray('[data-count]').forEach((el) => {
        const end = Number(el.dataset.count);
        if (reduced) {
          el.textContent = String(end);
          return;
        }
        const o = { v: 0 };
        el.textContent = '0';
        ScrollTrigger.create({
          trigger: el,
          start: 'top 90%',
          once: true,
          onEnter: () =>
            gsap.to(o, {
              v: end,
              duration: 1.6,
              ease: 'power2.out',
              onUpdate: () => {
                el.textContent = String(Math.round(o.v));
              },
            }),
        });
      });

      if (reduced) return;

      // Entrance timeline
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
      intro
        .from('.cin-nav', { y: -24, opacity: 0, duration: 0.9 })
        .from('.cin-hero .cin-eyebrow', { y: 16, opacity: 0, duration: 0.8 }, '-=0.5')
        .from('.cin-hero .cin-wi', { yPercent: 115, duration: 1.1, stagger: 0.08 }, '-=0.5')
        .from('.cin-hero .cin-lead', { y: 20, opacity: 0, duration: 0.9 }, '-=0.6')
        .from('.cin-hero .cin-actions > *', { y: 20, opacity: 0, duration: 0.8, stagger: 0.1 }, '-=0.6')
        .from('.cin-scrollhint', { opacity: 0, duration: 1 }, '-=0.3');

      // Scroll reveals
      gsap.utils.toArray('.cin-panel, .cin-final').forEach((sec) => {
        const trig = { trigger: sec, start: 'top 70%', once: true };
        gsap.from(sec.querySelectorAll('.cin-wi'), {
          yPercent: 115,
          duration: 1,
          stagger: 0.05,
          ease: 'power3.out',
          scrollTrigger: trig,
        });
        gsap.from(sec.querySelectorAll('[data-reveal]'), {
          y: 30,
          opacity: 0,
          duration: 0.9,
          stagger: 0.09,
          ease: 'power3.out',
          scrollTrigger: trig,
        });
      });
    }, rootRef);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-aim the scene when the viewport crosses the mobile breakpoint.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const handler = () => goScene(currentScene.current);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jump = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -20 });
    else el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="cin-root" ref={rootRef}>
      <DatabaseScene apiRef={sceneApi} onReady={() => goScene(currentScene.current)} />
      <div className="cin-vignette" aria-hidden="true" />
      <div className="cin-grain" aria-hidden="true" />

      <header className="cin-nav">
        <Link to="/" className="cin-brand" aria-label="NimbusHost home">
          <span className="cin-brand-mark" aria-hidden="true" />
          NimbusHost
        </Link>
        <nav className="cin-nav-links" aria-label="Sections">
          {STORY.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => jump(e, s.id)}
              className={active === s.id ? 'is-active' : undefined}
              aria-current={active === s.id ? 'true' : undefined}
            >
              <i>{s.index}</i>
              <span>{s.nav}</span>
            </a>
          ))}
        </nav>
        <Link to={launchTo} className="cin-nav-cta">
          <span className="cin-live" aria-hidden="true" />
          <span className="cin-nav-cta-text">Launch Application</span>
          <span className="cin-nav-cta-arrow" aria-hidden="true">
            <ArrowUpRight size={14} />
          </span>
        </Link>
      </header>

      <main>
        <section className="cin-hero" data-scene="hero" id="top">
          <p className="cin-eyebrow">
            <span className="cin-eyebrow-dot" aria-hidden="true" />
            <em>Database Management Systems</em>
            <span className="cin-eyebrow-tag">AI203</span>
          </p>
          <h1 className="cin-h1">
            <span className="cin-line">
              <Words text="Rules live" />
            </span>
            <span className="cin-line">
              <Words text="in the database." />
            </span>
          </h1>
          <p className="cin-lead">
            NimbusHost is a cloud hosting platform where quotas, capacity, billing and audit are enforced by MySQL
            itself, not scattered across application code.
          </p>
          <div className="cin-actions">
            <Magnetic to={launchTo} className="cin-cta">
              <span>Launch Application</span>
              <ArrowUpRight size={18} />
            </Magnetic>
            <a href="#schema" className="cin-ghost" onClick={(e) => jump(e, 'schema')}>
              Explore the architecture
            </a>
          </div>
          <div className="cin-scrollhint" aria-hidden="true">
            <span>Scroll</span>
            <i />
          </div>
        </section>

        {STORY.map((s) => (
          <section
            key={s.id}
            id={s.id}
            data-scene={s.id}
            className={`cin-panel cin-panel--${s.side}`}
          >
            <div className="cin-panel-inner">
              <p className="cin-index" data-reveal>
                <span className="cin-index-num">{s.index}</span>
                <span className="cin-index-rule" aria-hidden="true" />
                <span className="cin-index-label">{s.label}</span>
                <span className="cin-index-of">/ {String(STORY.length).padStart(2, '0')}</span>
              </p>
              <h2 className="cin-h2">
                <Words text={s.title} />
              </h2>
              <p className="cin-body" data-reveal>
                {s.body}
              </p>
              <ul className="cin-points">
                {s.points.map((p) => (
                  <li key={p} data-reveal>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}

        <section className="cin-final" data-scene="final" id="launch">
          <h2 className="cin-h2 cin-h2--xl">
            <Words text="Step inside." />
          </h2>
          <p className="cin-body cin-body--center" data-reveal>
            Sign in and run the real thing: launch servers, attach volumes, manage domains and watch the invoices
            appear.
          </p>
          <div className="cin-actions cin-actions--center" data-reveal>
            <Magnetic to={launchTo} className="cin-cta">
              <span>Launch Application</span>
              <ArrowUpRight size={18} />
            </Magnetic>
          </div>
          <ul className="cin-stats" aria-label="Project at a glance">
            {STATS.map((s) => (
              <li key={s.label} data-reveal>
                <b data-count={s.value}>{s.value}</b>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="cin-footer">NimbusHost Cloud Management System · AI203 DBMS Project · SVNIT Surat</footer>
    </div>
  );
}
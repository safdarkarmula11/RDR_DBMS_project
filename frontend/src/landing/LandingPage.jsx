import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowUpRight, LifeBuoy, Receipt, Server, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { HOME } from '../nav';
import { useSmoothScroll } from './useSmoothScroll';
import DatabaseScene from './DatabaseScene';
import NimbusLogo from './NimbusLogo';
import '../styles/landing-cinematic.css';

gsap.registerPlugin(ScrollTrigger);

/* ------------------------------------------------------------------ */
/*  Content (edit the TEAM block with your real names)                 */
/* ------------------------------------------------------------------ */

// EDIT ME: put your real team members here (2 to 4 people).
const TEAM = [
  {
    name: 'Safdar Karmula',
    area: 'Database Functions, Views, Seed Data, and Documentation',
    focus: [
      'Functions, views and seed data',
      'Metering, billing, pricing and scheduled events',
      'Triggers, audit trail and integrity tests',
      'Customer frontend',
      'Admin, billing and support frontend',
      'Documentation, final report, PPT, demo script and acceptance tests',
    ],
  },

  {
    name: 'Suyash Naik',
    area: 'Database Architecture, Compute, Analytics and Backend',
    focus: [
      'Schema design, normalization proof and ER diagram',
      'Compute scheduler and concurrency',
      'Metering, billing, pricing and scheduled events',
      'Backend API, Zod validation and error mapping',
      'Analytics, reports, star schema and Performance Lab',
      'Admin, billing and support frontend',
    ],
  },

  {
    name: 'Nishit Gamit',
    area: 'Database Procedures, Backend Infrastructure and Analytics',
    focus: [
      'Functions, views and seed data',
      'Compute scheduler and concurrency',
      'Storage and network procedures',
      'Security, roles and grants, JWT auth, RBAC, backup and restore',
      'Metering, billing, pricing and scheduled events',
      'Analytics, reports, star schema and Performance Lab',
      'Documentation, final report, PPT, demo script and acceptance tests',
    ],
  },

  {
    name: 'Yugesh Ratnaparkhi',
    area: 'Database Design, Storage, Security and Frontend',
    focus: [
      'Schema design, normalization proof and ER diagram',
      'Functions, views and seed data',
      'Storage and network procedures',
      'Triggers, audit trail and integrity tests',
      'Security, roles and grants, JWT auth, RBAC, backup and restore',
      'Backend API, Zod validation and error mapping',
      'Customer frontend',
    ],
  },
];

// Scene state per section. On narrow screens the scene stays centred.
const SCENES = {
  hero: { x: 0, z: 9.2, morph: 0, shell: 0.14, spin: 0.12, glow: 0.5 },
  schema: { x: 2.7, z: 8.2, morph: 1, shell: 0.05, spin: 0.04, glow: 0.3 },
  guard: { x: -2.7, z: 8.4, morph: 0, shell: 0.34, spin: 0.3, glow: 0.6 },
  billing: { x: 2.7, z: 7.4, morph: 0.45, shell: 0.16, spin: 0.2, glow: 0.45 },
  flow: { x: 0, z: 11, morph: 0.25, shell: 0.2, spin: 0.22, glow: 0.4 },
  roles: { x: 0, z: 12.2, morph: 0, shell: 0.1, spin: 0.1, glow: 0.28 },
  team: { x: 0, z: 12.8, morph: 0, shell: 0.08, spin: 0.08, glow: 0.25 },
  final: { x: 0, z: 10.6, morph: 0, shell: 0.22, spin: 0.16, glow: 0.65 },
};

const TOTAL = '05';

const STORY = [
  {
    id: 'schema',
    index: '01',
    label: 'Schema',
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
    side: 'left',
    title: 'Metered every minute. Billed by the book.',
    body:
      'Usage lands in a partitioned table, is priced from a dated price history and becomes invoices with tax and credit, driven by stored procedures and scheduled events.',
    points: ['Temporal pricing', '27 stored procedures', '7 scheduled events'],
  },
];

const FLOW = [
  { n: '01', title: 'Meter', obj: 'ev_hourly_metering', text: 'A scheduled event records usage for every running server.' },
  { n: '02', title: 'Price', obj: 'fn_hourly_price', text: 'Each reading is priced with the rate that was valid on its day.' },
  { n: '03', title: 'Invoice', obj: 'sp_generate_invoice', text: 'Usage becomes line items, tax and credit. Amounts freeze once issued.' },
  { n: '04', title: 'Pay', obj: 'sp_apply_payment', text: 'Payments are idempotent and overpayment is rejected.' },
  { n: '05', title: 'Chase', obj: 'ev_suspend_overdue', text: 'Thirty days past due suspends the account and its servers.' },
];

const ROLES = [
  {
    icon: Server,
    name: 'Customer',
    demo: 'owner@acme.test',
    text: 'Launch servers, attach volumes, manage domains and DNS, read invoices and open tickets.',
    pages: ['Instances', 'Launch wizard', 'Volumes', 'Network', 'Invoices'],
  },
  {
    icon: LifeBuoy,
    name: 'Support',
    demo: 'support@nimbus.test',
    text: 'Work the ticket queue, track SLA targets and look up customers.',
    pages: ['Ticket queue', 'SLA board', 'Customers'],
  },
  {
    icon: Receipt,
    name: 'Billing',
    demo: 'billing@nimbus.test',
    text: 'Generate invoices, age overdue accounts, add credit and read revenue.',
    pages: ['Aging', 'Credits', 'Revenue'],
  },
  {
    icon: ShieldCheck,
    name: 'Admin',
    demo: 'admin@nimbus.test',
    text: 'Hosts and capacity, pricing history, audit log, consistency checks and the performance lab.',
    pages: ['Capacity', 'Audit log', 'Reports', 'Perf lab'],
  },
];

const FACTS = [
  'SKIP LOCKED scheduling',
  'Temporal pricing',
  'Append-only audit log',
  '38 foreign keys',
  'Range-partitioned metering',
  'Row-level tenant views',
  'Idempotent payments',
  'Star-schema analytics',
  'Deadlock-safe retries',
  'Soft delete everywhere',
];

const STACK = ['MySQL 8', 'Node.js', 'Express', 'React', 'Three.js', 'GSAP'];

const STATS = [
  { value: 35, label: 'Tables' },
  { value: 27, label: 'Procedures' },
  { value: 79, label: 'Triggers' },
  { value: 25, label: 'Views' },
  { value: 20, label: 'Reports' },
];

const DOTS = [
  { scene: 'hero', id: 'top', label: 'Intro' },
  { scene: 'schema', id: 'schema', label: 'Schema' },
  { scene: 'guard', id: 'guard', label: 'Guard' },
  { scene: 'billing', id: 'billing', label: 'Billing' },
  { scene: 'flow', id: 'flow', label: 'Flow' },
  { scene: 'roles', id: 'roles', label: 'Roles' },
  { scene: 'team', id: 'team', label: 'Team' },
  { scene: 'final', id: 'launch', label: 'Launch' },
];

const NAV = [
  { scene: 'schema', id: 'schema', index: '01', label: 'Architecture' },
  { scene: 'guard', id: 'guard', index: '02', label: 'Integrity' },
  { scene: 'billing', id: 'billing', index: '03', label: 'Billing' },
  { scene: 'roles', id: 'roles', index: '04', label: 'Roles' },
  { scene: 'team', id: 'team', index: '05', label: 'Team' },
];

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function Words({ text }) {
  return text.split(' ').map((w, i) => (
    <React.Fragment key={`${w}-${i}`}>
      <span className="cin-w">
        <span className="cin-wi">{w}</span>
      </span>{' '}
    </React.Fragment>
  ));
}

const SQL_KW = new Set(['IF', 'THEN', 'END', 'SIGNAL', 'SQLSTATE', 'SET', 'NOT', 'IN', 'AND', 'OR', 'UNIQUE', 'KEY', 'MESSAGE_TEXT', 'NULL']);
const SQL_TOKEN = /(--.*$|'[^']*'|\b\d+(?:\.\d+)?\b|\b(?:IF|THEN|END|SIGNAL|SQLSTATE|SET|NOT|IN|AND|OR|UNIQUE|KEY|MESSAGE_TEXT|NULL)\b)/gm;

function Sql({ code }) {
  return (
    <pre className="cin-code">
      <code>
        {code.split(SQL_TOKEN).map((t, i) => {
          if (!t) return null;
          let cls = null;
          if (t.startsWith('--')) cls = 'c';
          else if (t.startsWith("'")) cls = 's';
          else if (/^\d/.test(t)) cls = 'n';
          else if (SQL_KW.has(t)) cls = 'k';
          return cls ? (
            <span key={i} className={`sql-${cls}`}>
              {t}
            </span>
          ) : (
            <React.Fragment key={i}>{t}</React.Fragment>
          );
        })}
      </code>
    </pre>
  );
}

function CardBar({ title }) {
  return (
    <div className="cin-card-bar">
      <i />
      <i />
      <i />
      <span>{title}</span>
    </div>
  );
}

const GUARD_SQL = `-- trg_instances_bu_rules (excerpt, simplified)
IF OLD.status = 'running'
   AND NEW.status NOT IN ('stopped','suspended','terminated') THEN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'This status change is not allowed';
END IF;`;

const SCHEMA_SQL = `UNIQUE KEY uq_inst_live_name
  (org_id, (IF(status = 'terminated', NULL, name)));`;

function StoryCard({ id }) {
  if (id === 'schema') {
    return (
      <div className="cin-card" data-reveal>
        <CardBar title="foreign keys · live names" />
        <div className="cin-erd">
          <div className="cin-erd-node">
            <b>organizations</b>
            <small>org_id PK</small>
          </div>
          <div className="cin-erd-link">1:N</div>
          <div className="cin-erd-node">
            <b>instances</b>
            <small>host_id FK</small>
          </div>
          <div className="cin-erd-link">N:1</div>
          <div className="cin-erd-node">
            <b>hosts</b>
            <small>host_id PK</small>
          </div>
        </div>
        <Sql code={SCHEMA_SQL} />
      </div>
    );
  }
  if (id === 'guard') {
    return (
      <div className="cin-card" data-reveal>
        <CardBar title="trigger · BEFORE UPDATE" />
        <Sql code={GUARD_SQL} />
      </div>
    );
  }
  return (
    <div className="cin-card" data-reveal>
      <CardBar title="worked example · sp_generate_invoice" />
      <div className="cin-receipt">
        <div>
          <span>usage</span>
          <span>100.000 h × 0.0210 = 2.10</span>
        </div>
        <div>
          <span>tax 18%</span>
          <span>0.38</span>
        </div>
        <div>
          <span>credit applied</span>
          <span>−0.50</span>
        </div>
        <div className="total">
          <span>total due</span>
          <span>1.98</span>
        </div>
      </div>
    </div>
  );
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

function TiltCard({ children }) {
  const ref = useRef(null);
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    const s = ref.current.style;
    s.setProperty('--rx', `${(-py * 8).toFixed(2)}deg`);
    s.setProperty('--ry', `${(px * 10).toFixed(2)}deg`);
    s.setProperty('--mx', `${((px + 0.5) * 100).toFixed(1)}%`);
    s.setProperty('--my', `${((py + 0.5) * 100).toFixed(1)}%`);
  };
  const onLeave = () => {
    if (!ref.current) return;
    const s = ref.current.style;
    s.setProperty('--rx', '0deg');
    s.setProperty('--ry', '0deg');
    s.setProperty('--mx', '50%');
    s.setProperty('--my', '50%');
  };
  return (
    <article ref={ref} className="cin-tilt" onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </article>
  );
}

function SecHead({ index, label, title, center = false }) {
  return (
    <div className={`cin-sechead${center ? ' cin-sechead--center' : ''}`}>
      <p className="cin-index" data-reveal>
        <span className="cin-index-num">{index}</span>
        <span className="cin-index-rule" aria-hidden="true" />
        <span className="cin-index-label">{label}</span>
        {!center && <span className="cin-index-of">/ {TOTAL}</span>}
      </p>
      <h2 className="cin-h2">
        <Words text={title} />
      </h2>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#05070d'/><circle cx='32' cy='32' r='15' fill='none' stroke='#5ad6ff' stroke-width='4'/><circle cx='32' cy='32' r='5' fill='#ffb454'/></svg>",
  );

export default function LandingPage() {
  const { user } = useAuth();
  const rootRef = useRef(null);
  const sceneApi = useRef(null);
  const currentScene = useRef('hero');
  const [active, setActive] = useState('hero');
  const lenisRef = useSmoothScroll({ enabled: true });

  const [showLoader] = useState(() => {
    if (typeof window === 'undefined') return false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem('cin-intro') === '1';
    } catch (e) {
      seen = false;
    }
    return !reduced && !seen;
  });

  // The real application entry: role home when signed in, otherwise the login screen.
  const launchTo = user ? HOME[user.role] || '/dashboard' : '/login';

  const goScene = (key) => {
    currentScene.current = key;
    const base = SCENES[key];
    const narrow = window.matchMedia('(max-width: 900px)').matches;
    sceneApi.current?.setTarget(narrow ? { ...base, x: 0, z: base.z + 1.6 } : base);
  };

  // 12. Page title, description, theme colour and favicon for this page only.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'NimbusHost · Cloud hosting where the rules live in the database';

    const upsert = (selector, make) => {
      let el = document.head.querySelector(selector);
      const created = !el;
      if (!el) {
        el = make();
        document.head.appendChild(el);
      }
      return { el, created };
    };
    const desc = upsert('meta[name="description"]', () => {
      const m = document.createElement('meta');
      m.name = 'description';
      return m;
    });
    const prevDesc = desc.el.getAttribute('content');
    desc.el.setAttribute(
      'content',
      'NimbusHost is a cloud hosting platform built for AI203 DBMS: quotas, capacity, billing and audit enforced inside MySQL.',
    );
    const theme = upsert('meta[name="theme-color"]', () => {
      const m = document.createElement('meta');
      m.name = 'theme-color';
      return m;
    });
    const prevTheme = theme.el.getAttribute('content');
    theme.el.setAttribute('content', '#05070d');
    const icon = upsert('link[rel="icon"]', () => {
      const l = document.createElement('link');
      l.rel = 'icon';
      return l;
    });
    const prevIcon = icon.el.getAttribute('href');
    const prevIconType = icon.el.getAttribute('type');
    icon.el.setAttribute('type', 'image/svg+xml');
    icon.el.setAttribute('href', FAVICON);

    return () => {
      document.title = prevTitle;
      if (desc.created) desc.el.remove();
      else desc.el.setAttribute('content', prevDesc || '');
      if (theme.created) theme.el.remove();
      else theme.el.setAttribute('content', prevTheme || '');
      if (icon.created) icon.el.remove();
      else {
        icon.el.setAttribute('href', prevIcon || '');
        if (prevIconType) icon.el.setAttribute('type', prevIconType);
        else icon.el.removeAttribute('type');
      }
    };
  }, []);

  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const html = document.documentElement;
    const root = rootRef.current;

    const ctx = gsap.context(() => {
      // Scene + active section follow the section in view.
      gsap.utils.toArray('[data-scene]').forEach((sec) => {
        const enter = () => {
          goScene(sec.dataset.scene);
          setActive(sec.dataset.scene);
        };
        ScrollTrigger.create({
          trigger: sec,
          start: 'top 55%',
          end: 'bottom 55%',
          onEnter: enter,
          onEnterBack: enter,
        });
      });

      // 5. Scroll progress line
      const bar = root.querySelector('.cin-progress i');
      if (bar) {
        ScrollTrigger.create({
          start: 0,
          end: 'max',
          onUpdate: (self) => {
            bar.style.transform = `scaleX(${self.progress})`;
          },
        });
      }

      // 2. Billing flow lights up step by step
      const flow = root.querySelector('.cin-flow');
      if (flow) {
        const steps = flow.querySelectorAll('.cin-step');
        if (reduced) {
          flow.style.setProperty('--p', '1');
          steps.forEach((s) => s.classList.add('is-on'));
        } else {
          ScrollTrigger.create({
            trigger: flow,
            start: 'top 40%',
            end: 'bottom 85%',
            onUpdate: (self) => {
              const p = self.progress;
              flow.style.setProperty('--p', p.toFixed(3));
              steps.forEach((s, i) => s.classList.toggle('is-on', p > ((i + 0.3) / steps.length) * 0.95));
            },
          });
        }
      }

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
          start: 'top 92%',
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

      // Entrance timeline (starts after the loader when there is one)
      const intro = gsap.timeline({ paused: showLoader, defaults: { ease: 'power3.out' } });
      intro
        .from('.cin-nav', { y: -24, opacity: 0, duration: 0.9 })
        .from('.cin-hero .cin-eyebrow', { y: 16, opacity: 0, duration: 0.8 }, '-=0.5')
        .from('.cin-hero .cin-wi', { yPercent: 115, duration: 1.1, stagger: 0.08 }, '-=0.5')
        .from('.cin-hero .cin-lead', { y: 20, opacity: 0, duration: 0.9 }, '-=0.6')
        .from('.cin-hero .cin-actions > *', { y: 20, opacity: 0, duration: 0.8, stagger: 0.1 }, '-=0.6')
        .from('.cin-scrollhint, .cin-dots', { opacity: 0, duration: 1 }, '-=0.3');

      // Scroll reveals
      gsap.utils.toArray('.cin-panel, .cin-sec, .cin-final').forEach((sec) => {
        const trig = { trigger: sec, start: 'top 72%', once: true };
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

      // 8. Short intro loader
      if (showLoader) {
        html.style.overflow = 'hidden';
        const num = root.querySelector('.cin-loader-count');
        const count = { v: 0 };
        gsap
          .timeline({
            onComplete: () => {
              html.style.overflow = '';
              try {
                sessionStorage.setItem('cin-intro', '1');
              } catch (e) {
                /* ignore */
              }
              ScrollTrigger.refresh();
            },
          })
          .to(
            count,
            {
              v: 100,
              duration: 1.3,
              ease: 'power2.inOut',
              onUpdate: () => {
                if (num) num.textContent = String(Math.round(count.v)).padStart(3, '0');
              },
            },
            0,
          )
          .to('.cin-loader-bar i', { scaleX: 1, duration: 1.3, ease: 'power2.inOut' }, 0)
          .to('.cin-loader-count, .cin-loader-top', { opacity: 0, y: -16, duration: 0.35 }, '>0.1')
          .to('.cin-loader', { yPercent: -100, duration: 0.9, ease: 'power4.inOut' }, '>-0.05')
          .call(() => intro.play(), null, '-=0.55')
          .set('.cin-loader', { display: 'none' });
      }
    }, rootRef);

    return () => {
      html.style.overflow = '';
      ctx.revert();
    };
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

  // 6. Glow cursor + hover ring (mouse devices only)
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = rootRef.current;
    const glow = root.querySelector('.cin-cursor-glow');
    const ring = root.querySelector('.cin-cursor-ring');
    if (!fine || reduced || !glow || !ring) return undefined;

    gsap.set([glow, ring], { x: -200, y: -200, opacity: 0 });
    const gx = gsap.quickTo(glow, 'x', { duration: 0.9, ease: 'power3.out' });
    const gy = gsap.quickTo(glow, 'y', { duration: 0.9, ease: 'power3.out' });
    const rx = gsap.quickTo(ring, 'x', { duration: 0.28, ease: 'power3.out' });
    const ry = gsap.quickTo(ring, 'y', { duration: 0.28, ease: 'power3.out' });

    const move = (e) => {
      gsap.to([glow, ring], { opacity: 1, duration: 0.4, overwrite: 'auto' });
      gx(e.clientX);
      gy(e.clientY);
      rx(e.clientX);
      ry(e.clientY);
    };
    const over = (e) => {
      const t = e.target instanceof Element ? e.target.closest('a, button, .cin-tilt') : null;
      ring.classList.toggle('is-hover', Boolean(t));
    };
    const leave = () => gsap.to([glow, ring], { opacity: 0, duration: 0.3, overwrite: 'auto' });

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerover', over, { passive: true });
    document.documentElement.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerover', over);
      document.documentElement.removeEventListener('mouseleave', leave);
    };
  }, []);

  const jump = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -10 });
    else el.scrollIntoView({ behavior: 'smooth' });
  };

  const navActive = active === 'flow' ? 'billing' : active;

  return (
    <div className="cin-root" ref={rootRef}>
      {showLoader && (
        <div className="cin-loader" aria-hidden="true">
          <div className="cin-loader-top">
            <span>NimbusHost</span>
            <span>Loading the architecture</span>
          </div>
          <div>
            <div className="cin-loader-count">000</div>
            <div className="cin-loader-bar">
              <i />
            </div>
          </div>
        </div>
      )}

      <DatabaseScene apiRef={sceneApi} onReady={() => goScene(currentScene.current)} />
      <div className="cin-vignette" aria-hidden="true" />
      <div className="cin-grain" aria-hidden="true" />
      <div className="cin-cursor-glow" aria-hidden="true" />
      <div className="cin-cursor-ring" aria-hidden="true" />
      <div className="cin-progress" aria-hidden="true">
        <i />
      </div>

      <nav className="cin-dots" aria-label="Page sections">
        {DOTS.map((d) => (
          <a
            key={d.id}
            href={`#${d.id}`}
            onClick={(e) => jump(e, d.id)}
            className={active === d.scene ? 'is-active' : undefined}
            aria-label={d.label}
          >
            <span>{d.label}</span>
          </a>
        ))}
      </nav>

      <header className="cin-nav">
        <Link to="/" className="cin-brand" aria-label="NimbusHost home">
          <NimbusLogo />
        </Link>
        <nav className="cin-nav-links" aria-label="Sections">
          {NAV.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => jump(e, s.id)}
              className={navActive === s.scene ? 'is-active' : undefined}
              aria-current={navActive === s.scene ? 'true' : undefined}
            >
              <i>{s.index}</i>
              <span>{s.label}</span>
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

      <main id="main-content">
        <section className="cin-hero" data-scene="hero" id="top">
          <p className="cin-eyebrow">
            <span className="cin-eyebrow-dot" aria-hidden="true" />
            <em>Database Management Systems</em>
            <span className="cin-eyebrow-tag">AI203</span>
          </p>
          <h1 className="cin-h1">
            <span className="cin-line">
              <Words text="One Cloud" />
            </span>
            <span className="cin-line">
              <Words text="For All." />
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

        {/* 7. Facts strip */}
        <div className="cin-marquee" aria-hidden="true">
          <div className="cin-marquee-track">
            {[...FACTS, ...FACTS].map((f, i) => (
              <span className="cin-marquee-item" key={`${f}-${i}`}>
                {f}
                <b />
              </span>
            ))}
          </div>
        </div>

        {STORY.map((s) => (
          <section key={s.id} id={s.id} data-scene={s.id} className={`cin-panel cin-panel--${s.side}`}>
            <div className="cin-panel-inner">
              <p className="cin-index" data-reveal>
                <span className="cin-index-num">{s.index}</span>
                <span className="cin-index-rule" aria-hidden="true" />
                <span className="cin-index-label">{s.label}</span>
                <span className="cin-index-of">/ {TOTAL}</span>
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
              {/* 1. Real project excerpts */}
              <StoryCard id={s.id} />
            </div>
          </section>
        ))}

        {/* 2. How billing flows */}
        <div className="cin-flow" id="flow" data-scene="flow">
          <div className="cin-flow-sticky cin-sec">
            <SecHead index="03" label="Billing flow" title="From a running server to a paid invoice." center />
            <div className="cin-steps">
              <div className="cin-rail" aria-hidden="true">
                <i />
              </div>
              {FLOW.map((f) => (
                <div className="cin-step" key={f.n}>
                  <span className="cin-step-dot">{f.n}</span>
                  <div className="cin-step-body">
                    <h3>{f.title}</h3>
                    <code>{f.obj}</code>
                    <p>{f.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3 + 11. Roles with demo shortcuts */}
        <section className="cin-sec" id="roles" data-scene="roles">
          <SecHead index="04" label="Roles" title="Four roles, four views of one database." center />
          <div className="cin-roles">
            {ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <div className="cin-cell" key={r.name} data-reveal>
                  <TiltCard>
                    <span className="cin-role-icon">
                      <Icon size={20} />
                    </span>
                    <h3>{r.name}</h3>
                    <p>{r.text}</p>
                    <ul className="cin-role-pages">
                      {r.pages.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                    <Link
                      to={user ? launchTo : '/login'}
                      state={user ? undefined : { demo: r.demo }}
                      className="cin-role-try"
                    >
                      {user ? 'Open the console' : `Try as ${r.name}`}
                      <ArrowUpRight size={15} />
                    </Link>
                  </TiltCard>
                </div>
              );
            })}
          </div>
        </section>

        {/* 10. Team */}
        <section className="cin-sec" id="team" data-scene="team">
          <SecHead index="05" label="Team" title="Built by people who can defend every table." center />
          <div className="cin-roles cin-team">
            {TEAM.map((m) => (
              <div className="cin-cell" key={m.name} data-reveal>
                <TiltCard>
                  <span className="cin-avatar" aria-hidden="true">
                    {m.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <h3>{m.name}</h3>
                  <p className="cin-team-area">{m.area}</p>
                  <ul className="cin-role-pages">
                    {m.focus.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </TiltCard>
              </div>
            ))}
          </div>
        </section>

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

          {/* 9. Stack */}
          <div className="cin-stack" data-reveal>
            <span className="cin-stack-label">Built with</span>
            {STACK.map((s) => (
              <span className="cin-chip" key={s}>
                {s}
              </span>
            ))}
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
/**
 * NimbusHost Intro Experience Configuration
 * Centralized animation durations, scrub distances, and parameters.
 */
export const INTRO_CONFIG = {
  // Preloader configuration
  preloader: {
    durationMs: 2000,
    sessionKey: 'nimbus_intro_seen',
    title: 'NimbusHost Core',
    subtitle: 'Mounting virtualized cluster schema...',
  },

  // Hero pinned scrub sequence (350vh for smooth, cinematic zoom-in through the collage)
  hero: {
    pinDistance: '350vh',
    scrubSmoothness: 1.0,
  },

  // Parallax background layers depth speed factors
  parallax: {
    gridSpeed: 0.15,   // Layer 1: Background blueprint grid (slowest)
    nodesSpeed: 0.45,  // Layer 2: Mid-ground floating data nodes
    hudSpeed: 0.85,    // Layer 3: Foreground telemetry HUD (fastest)
  },

  // Pinned feature sections
  features: [
    {
      id: 'scale',
      tag: '01 / ELASTIC CLUSTERING',
      title: 'High-Density Compute Allocation',
      description:
        'Sub-second provisioning of virtual CPU, memory, and NVMe block storage across distributed bare-metal hypervisors with zero host fragmentation.',
      badge: 'Dynamic Hypervisor Balancer',
      stats: [
        { label: 'Host Provisioning', val: '< 650ms' },
        { label: 'Hypervisor Density', val: '32 Cores / Node' },
      ],
    },
    {
      id: 'security',
      tag: '02 / MULTI-TENANT ISOLATION',
      title: 'Zero-Trust Defense-in-Depth',
      description:
        'Three-tiered isolation architecture: cryptographically signed JWT sessions, row-level tenant boundary views, and immutable tamper-evident audit logging.',
      badge: 'Bcrypt-12 & Row Isolation',
      stats: [
        { label: 'Access Token Life', val: '15 Minutes' },
        { label: 'Audit Trail', val: 'Tamper-Evident' },
      ],
    },
    {
      id: 'backup',
      tag: '03 / CRASH CONSISTENCY',
      title: 'Automated Snapshot & Point-in-Time Recovery',
      description:
        'Continuous differential block snapshots and transactional rollbacks ensure zero drift, zero phantom writes, and instant restore capability.',
      badge: 'InnoDB Crash Recovery',
      stats: [
        { label: 'Recovery Point (RPO)', val: '0 Seconds' },
        { label: 'Replication Latency', val: '< 5ms' },
      ],
    },
  ],
};

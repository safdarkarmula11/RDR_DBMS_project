// NimbusHost API smoke test.
// Logs in as every demo role and calls the endpoints that role uses.
// Prints every failure with the server's real error message.
//
// Usage (backend must be running):  node scripts/smokeTest.js
// Optional:                         API_URL=http://localhost:5000/api node scripts/smokeTest.js

const BASE = process.env.API_URL || 'http://localhost:5000/api';
const DELAY_MS = 700; // stays under the 100 requests/minute rate limit

const ACCOUNTS = {
  customer: { email: 'owner@acme.test', password: 'customer123' },
  support: { email: 'support@nimbus.test', password: 'support123' },
  billing: { email: 'billing@nimbus.test', password: 'billing123' },
  admin: { email: 'admin@nimbus.test', password: 'admin123' },
};

const reports = Array.from({ length: 20 }, (_, i) => `/reports/R${i + 1}`);

const CHECKS = {
  customer: [
    '/auth/me', '/catalog/regions', '/catalog/instance-types', '/catalog/images',
    '/instances', '/instances/quota', '/storage/quota', '/storage/volumes', '/storage/snapshots',
    '/network/ips', '/network/domains', '/network/dns', '/invoices', '/usage', '/tickets',
    '/orgs/members', '/auth/api-keys',
  ],
  support: ['/auth/me', '/support/queue', '/support/my-tickets', '/support/sla', '/support/customers', '/tickets'],
  billing: [
    '/auth/me', '/billing/overview', '/billing/invoices', '/billing/aging', '/billing/organizations',
    '/billing/credits/transactions', '/billing/usage',
  ],
  admin: [
    '/auth/me', '/infra/capacity', '/infra/hosts', '/infra/audit', '/infra/regions', '/infra/instance-types',
    '/pricing', '/admin/consistency-check', '/admin/audit', '/admin/slow-queries', '/admin/perf/benchmarks',
    '/orgs', ...reports,
  ],
};

// After the list calls, open the first row of these lists to test the detail routes.
const DETAILS = {
  customer: [['/instances', '/instances/:id'], ['/invoices', '/invoices/:id'], ['/tickets', '/tickets/:id']],
  billing: [['/billing/invoices', '/billing/invoices/:id']],
  admin: [],
};

const results = { ok: 0, denied: 0, fail: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, token, body) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const started = Date.now();
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      return { status: 0, ms: Date.now() - started, error: `Cannot reach ${BASE} (${err.cause?.code || err.message}). Is the backend running?` };
    }
    if (res.status === 429 && attempt < 2) {
      console.log('   rate limited, waiting 20 s...');
      await sleep(20000);
      continue;
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, ms: Date.now() - started, data };
  }
  return { status: 429, ms: 0, error: 'Rate limited' };
}

function report(method, path, r) {
  const label = `${method} ${path}`;
  if (r.status >= 200 && r.status < 300) {
    results.ok += 1;
    console.log(`  ok    ${r.status} ${label} (${r.ms} ms)`);
  } else if (r.status === 403) {
    results.denied += 1;
    console.log(`  deny  403 ${label}  <- role not allowed (check this is expected)`);
  } else {
    results.fail += 1;
    const msg = r.error || r.data?.msg || r.data?.error || JSON.stringify(r.data) || '';
    const hint = r.data?.hint ? ` | ${r.data.hint}` : '';
    console.log(`  FAIL  ${r.status} ${label}\n        ${msg}${hint}`);
  }
}

async function runRole(role) {
  console.log(`\n=== ${role.toUpperCase()} (${ACCOUNTS[role].email}) ===`);
  const login = await call('POST', '/auth/login', null, ACCOUNTS[role]);
  const token = login.data?.token;
  if (!token) {
    results.fail += 1;
    console.log(`  FAIL  ${login.status} POST /auth/login\n        ${login.error || login.data?.msg || JSON.stringify(login.data)}`);
    return;
  }
  results.ok += 1;
  console.log(`  ok    ${login.status} POST /auth/login`);

  const lists = {};
  for (const path of CHECKS[role]) {
    const r = await call('GET', path, token);
    report('GET', path, r);
    if (Array.isArray(r.data)) lists[path] = r.data;
    await sleep(DELAY_MS);
  }

  for (const [listPath, detailPattern] of DETAILS[role] || []) {
    const first = lists[listPath]?.[0];
    const id = first && (first.instance_id ?? first.invoice_id ?? first.ticket_id ?? first.id);
    if (id === undefined) {
      console.log(`  skip  ${detailPattern} (no rows in ${listPath} to open)`);
      continue;
    }
    const path = detailPattern.replace(':id', id);
    report('GET', path, await call('GET', path, token));
    await sleep(DELAY_MS);
  }

  if (role === 'admin') {
    console.log('\n  -- Performance Lab benchmarks --');
    for (let i = 1; i <= 10; i += 1) {
      const r = await call('POST', '/admin/perf/run', token, { queryId: `Q${i}` });
      report('POST', `/admin/perf/run Q${i}`, r);
      await sleep(DELAY_MS);
    }
  }
}

async function main() {
  console.log(`NimbusHost smoke test against ${BASE}`);
  const health = await call('GET', '/health');
  if (health.status !== 200) {
    console.log(`\nBackend not healthy: ${health.error || health.status}. Start it with: npm run dev`);
    process.exit(1);
  }
  for (const role of Object.keys(ACCOUNTS)) {
    await runRole(role);
  }
  console.log(`\nDone: ${results.ok} ok, ${results.denied} denied (403), ${results.fail} FAILED`);
  process.exit(results.fail ? 1 : 0);
}

main();
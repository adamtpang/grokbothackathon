import { put, list, del } from '@vercel/blob';

// Each write is a new immutable version: jobs/<id>/v-<time>-<rand>.json.
// Reads list the prefix (strongly consistent) and fetch the newest version,
// which avoids stale CDN caches on overwritten blobs.
const prefix = (id) => `jobs/${id}/`;
export const validId = (id) => typeof id === 'string' && /^[a-z0-9]{6,40}$/i.test(id);
export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export function summarize(j) {
  const R = j.results || {};
  const L = R.listing || {}; const P = R.price || {}; const I = R.identification || {};
  const inq = Array.isArray(j.inquiries) ? j.inquiries : [];
  return {
    id: j.id, kind: j.kind, stage: j.stage, test: !!j.test, created_at: j.created_at, updated_at: j.updated_at,
    title: j.kind === 'buy' ? j.query : (L.title || I.name || ''), image_url: j.image_url || null,
    price: L.price ?? P.recommended ?? null, low: P.low ?? null, high: P.high ?? null, median: P.median ?? null,
    listing_url: j.listing_url || null, question: j.question ? j.question.message : null,
    inquiries: inq.length, inquiries_drafted: inq.filter((q) => q.status === 'drafted').length,
    max_price: j.max_price ?? null, deals: j.kind === 'buy' && Array.isArray(R.deals) ? R.deals.slice(0, 20) : undefined,
  };
}

export async function saveJob(job) {
  job.updated_at = now();
  const key = `${prefix(job.id)}v-${String(Date.now()).padStart(15, '0')}-${Math.random().toString(36).slice(2, 8)}.json`;
  const opts = { access: 'public', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 };
  await Promise.all([
    put(key, JSON.stringify(job), opts),
    // Lightweight index for the dashboard; never let it break a job write.
    put(`jobs-index/${job.id}.json`, JSON.stringify(summarize(job)), opts).catch(() => null),
  ]);
  return job;
}

export async function recentJobs(limit = 30) {
  const ids = new Map();
  try {
    const { blobs } = await list({ prefix: 'jobs-index/', limit: 1000 });
    for (const b of blobs) { const m = b.pathname.match(/^jobs-index\/([a-z0-9]+)\.json$/i); if (m) ids.set(m[1], b.uploadedAt); }
  } catch (e) {}
  try {
    const { folders } = await list({ prefix: 'jobs/', mode: 'folded', limit: 1000 });
    for (const f of folders || []) { const m = f.match(/^jobs\/([a-z0-9]+)\/$/i); if (m && !ids.has(m[1])) ids.set(m[1], 0); }
  } catch (e) {}
  const all = [...ids.keys()].slice(0, 120);
  const jobs = [];
  for (let i = 0; i < all.length; i += 20) {
    const part = await Promise.all(all.slice(i, i + 20).map((id) => getJob(id).catch(() => null)));
    jobs.push(...part.filter(Boolean));
  }
  return jobs.filter((j) => !j.test).map(summarize).filter((s) => !/^test\b/i.test(String(s.title || ''))).sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))).slice(0, limit);
}

export async function getJob(id) {
  if (!validId(id)) return null;
  const { blobs } = await list({ prefix: prefix(id), limit: 1000 });
  if (!blobs.length) return null;
  blobs.sort((a, b) => (a.pathname < b.pathname ? -1 : 1));
  const latest = blobs[blobs.length - 1];
  const r = await fetch(latest.url, { cache: 'no-store' });
  if (!r.ok) return null;
  const job = await r.json();
  if (blobs.length > 40) {
    try { await del(blobs.slice(0, -5).map((b) => b.url)); } catch (e) {}
  }
  return job;
}

export async function uploadImage(id, file) {
  const ext = ((file.type || '').split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  const b = await put(`images/${id}.${ext}`, file, {
    access: 'public', contentType: file.type || 'image/jpeg', addRandomSuffix: true,
  });
  return b.url;
}

export function addLog(job, message, stage, source = 'app') {
  job.logs = job.logs || [];
  job.logs.push({ ts: now(), stage: stage || job.stage, message: String(message), source });
}

function validUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch (e) { return false; } }

// Optional direct webhook. Skips silently when GST_WEBHOOK_URL is missing or invalid.
export async function fireWebhook(job, event, extra = {}) {
  const url = process.env.GST_WEBHOOK_URL;
  if (!url || !validUrl(url)) return { skipped: true };
  const header = process.env.GST_WEBHOOK_HEADER || 'Authorization';
  const pfx = process.env.GST_WEBHOOK_PREFIX ?? 'Bearer ';
  const headers = { 'content-type': 'application/json' };
  if (process.env.GST_WEBHOOK_KEY) headers[header] = pfx + process.env.GST_WEBHOOK_KEY;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 3000);
  try {
    const r = await fetch(url, { method: 'POST', headers, signal: ac.signal, body: JSON.stringify({ job_id: job.id, kind: job.kind, event, ...extra }) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false }; } finally { clearTimeout(t); }
}

// Pending queue for the relay: index blobs at pending/<id>__<kind>__<event>.json
export function markPending(job, event, payload) {
  job.pending_event = event;
  job.pending_at = now();
  if (payload !== undefined) job.pending_payload = payload; else delete job.pending_payload;
  addLog(job, 'Queued for the Grok Bot worker');
}
const EV = /^[a-z_]{1,30}$/;
export async function indexPending(job, event, payload) {
  if (!EV.test(event)) throw new Error('bad event');
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await put(`pending/${job.id}__${job.kind}__${event}__${nonce}.json`, JSON.stringify({ job_id: job.id, kind: job.kind, event, payload: payload ?? null, at: now() }), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60,
  });
}
export async function listPending() {
  const { blobs } = await list({ prefix: 'pending/', limit: 1000 });
  const items = await Promise.all(blobs.map(async (b) => {
    const m = b.pathname.match(/^pending\/([a-z0-9]+)__([a-z]+)__([a-z_]+)(?:__([a-z0-9]+))?\.json$/i);
    if (!m) return null;
    let payload = null;
    try { const r = await fetch(b.url, { cache: 'no-store' }); if (r.ok) payload = (await r.json()).payload ?? null; } catch (e) {}
    return { job_id: m[1], kind: m[2], event: m[3], key: m[4] || '', payload, at: b.uploadedAt };
  }));
  return items.filter(Boolean);
}
export async function clearPending(id, event, key) {
  const { blobs } = await list({ prefix: `pending/${id}__`, limit: 100 });
  const urls = blobs.filter((b) => {
    if (key) return b.pathname.endsWith(`__${key}.json`);
    return !event || b.pathname.includes(`__${event}__`) || b.pathname.endsWith(`__${event}.json`);
  }).map((b) => b.url);
  if (urls.length) await del(urls);
  return urls.length;
}
export async function queue(job, event, payload) {
  if (job.test) { addLog(job, `Test job: "${event}" not queued for the worker`); await saveJob(job); return job; }
  markPending(job, event, payload);
  await saveJob(job);
  await indexPending(job, event, payload);
  return job;
}
export const isTest = (req, form) => req.headers.get('x-gst-test') === '1' || (form && String(form.get('test') || '') === '1');

export async function saveVersioned(prefixKey, obj) {
  const key = `${prefixKey}v-${String(Date.now()).padStart(15, '0')}-${Math.random().toString(36).slice(2, 8)}.json`;
  await put(key, JSON.stringify(obj), { access: 'public', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 });
}
export async function readLatest(prefixKey) {
  const { blobs } = await list({ prefix: prefixKey, limit: 1000 });
  if (!blobs.length) return null;
  blobs.sort((a, b) => (a.pathname < b.pathname ? -1 : 1));
  const r = await fetch(blobs[blobs.length - 1].url, { cache: 'no-store' });
  if (blobs.length > 40) { try { await del(blobs.slice(0, -5).map((b) => b.url)); } catch (e) {} }
  return r.ok ? r.json() : null;
}
export const workerOk = (req) => !!process.env.GST_WORKER_KEY && req.headers.get('x-worker-key') === process.env.GST_WORKER_KEY;

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });

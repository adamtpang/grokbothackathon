import { put, list, del } from '@vercel/blob';

// Each write is a new immutable version: jobs/<id>/v-<time>-<rand>.json.
// Reads list the prefix (strongly consistent) and fetch the newest version,
// which avoids stale CDN caches on overwritten blobs.
const prefix = (id) => `jobs/${id}/`;
export const validId = (id) => typeof id === 'string' && /^[a-z0-9]{6,40}$/i.test(id);
export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export async function saveJob(job) {
  job.updated_at = now();
  const key = `${prefix(job.id)}v-${String(Date.now()).padStart(15, '0')}-${Math.random().toString(36).slice(2, 8)}.json`;
  await put(key, JSON.stringify(job), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60,
  });
  return job;
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

export async function fireWebhook(job, event, extra = {}) {
  const url = process.env.GST_WEBHOOK_URL;
  if (!url) return { skipped: true };
  const header = process.env.GST_WEBHOOK_HEADER || 'Authorization';
  const pfx = process.env.GST_WEBHOOK_PREFIX ?? 'Bearer ';
  const headers = { 'content-type': 'application/json' };
  if (process.env.GST_WEBHOOK_KEY) headers[header] = pfx + process.env.GST_WEBHOOK_KEY;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 3000);
  try {
    const r = await fetch(url, {
      method: 'POST', headers, signal: ac.signal,
      body: JSON.stringify({ job_id: job.id, kind: job.kind, event, ...extra }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : String((e.cause && e.cause.code) || e.name || 'error') };
  } finally {
    clearTimeout(t);
  }
}

// After a webhook attempt, record the outcome without clobbering worker updates.
export async function noteWebhook(id, event, res) {
  if (res.skipped || res.ok) return;
  try {
    const job = await getJob(id);
    if (!job) return;
    addLog(job, res.error === 'timeout'
      ? `Worker notified (${event}); it is still starting up`
      : `Could not reach the worker for "${event}" (${res.status || res.error}). Waiting for worker`);
    await saveJob(job);
  } catch (e) {}
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });

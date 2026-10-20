import { put } from '@vercel/blob';
import { newId, now, validId, json } from '../../../lib/store';
export const dynamic = 'force-dynamic';
export async function POST(req) {
  const body = await req.json().catch(() => null);
  const ids = (body && Array.isArray(body.job_ids) ? body.job_ids : []).filter(validId).slice(0, 50);
  if (!ids.length) return json({ error: 'job_ids required' }, 400);
  const id = body.id && validId(body.id) ? body.id : newId();
  await put(`batches/${id}.json`, JSON.stringify({ id, created_at: now(), job_ids: ids }), { access: 'public', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 });
  return json({ id });
}

import { getJob, saveJob, clearPending, workerOk, validId, json } from '../../../../../lib/store';
export const dynamic = 'force-dynamic';
export async function POST(req, { params }) {
  if (!workerOk(req)) return json({ error: 'unauthorized' }, 401);
  if (!validId(params.id)) return json({ error: 'bad id' }, 400);
  const body = await req.json().catch(() => ({}));
  const event = body && body.event ? String(body.event) : '';
  const key = body && body.key ? String(body.key).replace(/[^a-z0-9]/gi, '') : '';
  const removed = await clearPending(params.id, event, key);
  const job = await getJob(params.id);
  if (job && (!event || job.pending_event === event)) {
    delete job.pending_event; delete job.pending_at; delete job.pending_payload; job.dispatched_at = new Date().toISOString();
    await saveJob(job);
  }
  return json({ ok: true, removed, job });
}

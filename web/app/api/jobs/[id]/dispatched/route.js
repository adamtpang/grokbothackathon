import { getJob, saveJob, clearPending, workerOk, validId, json } from '../../../../../lib/store';
export const dynamic = 'force-dynamic';
export async function POST(req, { params }) {
  if (!workerOk(req)) return json({ error: 'unauthorized' }, 401);
  if (!validId(params.id)) return json({ error: 'bad id' }, 400);
  const body = await req.json().catch(() => ({}));
  const event = body && body.event ? String(body.event) : '';
  const removed = await clearPending(params.id, event);
  const job = await getJob(params.id);
  if (job && (!event || job.pending_event === event)) {
    delete job.pending_event; delete job.pending_at; job.dispatched_at = new Date().toISOString();
    await saveJob(job);
  }
  return json({ ok: true, removed, job });
}

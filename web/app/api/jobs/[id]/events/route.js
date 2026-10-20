import { getJob, saveJob, addLog, json } from '../../../../../lib/store';
export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  const key = process.env.GST_WORKER_KEY;
  if (!key || req.headers.get('x-worker-key') !== key) return json({ error: 'unauthorized' }, 401);
  const body = await req.json().catch(() => null);
  if (!body || !body.type) return json({ error: 'body must have type log|stage|result' }, 400);
  const job = await getJob(params.id);
  if (!job) return json({ error: 'not found' }, 404);
  if (body.type === 'log') {
    if (body.stage) job.stage = String(body.stage);
    addLog(job, body.message ?? '', body.stage || job.stage, 'worker');
  } else if (body.type === 'stage') {
    if (!body.stage) return json({ error: 'stage required' }, 400);
    job.stage = String(body.stage);
    addLog(job, `Stage: ${job.stage}`, job.stage, 'worker');
  } else if (body.type === 'result') {
    const { type, ...fields } = body;
    job.results = { ...(job.results || {}), ...fields };
    if (fields.listing_url) job.listing_url = fields.listing_url;
    addLog(job, `Result: ${Object.keys(fields).join(', ') || 'empty'}`, job.stage, 'worker');
  } else {
    return json({ error: 'unknown type' }, 400);
  }
  await saveJob(job);
  return json(job);
}

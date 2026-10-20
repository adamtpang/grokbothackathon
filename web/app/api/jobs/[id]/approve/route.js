import { getJob, saveJob, addLog, fireWebhook, markPending, indexPending, json } from '../../../../../lib/store';
export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  const job = await getJob(params.id);
  if (!job) return json({ error: 'not found' }, 404);
  if (job.kind !== 'sell') return json({ error: 'only sell jobs can be approved' }, 400);
  if (job.stage !== 'awaiting_approval') return json({ error: `job is ${job.stage}, not awaiting_approval` }, 409);
  const body = await req.json().catch(() => ({}));
  const price = Number(body && body.price);
  job.stage = 'approved';
  if (body && body.price !== undefined && body.price !== '' && isFinite(price) && price >= 0) {
    job.approved_price = price;
    if (job.results && job.results.listing) job.results.listing.price = price;
  }
  addLog(job, `Approved by seller${job.approved_price !== undefined ? ` at $${job.approved_price}` : ''}. Posting next`, 'approved');
  if (job.test) { addLog(job, 'Test job: approval not queued for the worker', 'approved'); await saveJob(job); return json(job); }
  markPending(job, 'approved');
  await saveJob(job);
  await indexPending(job, 'approved');
  await fireWebhook(job, 'approved', job.approved_price !== undefined ? { price: job.approved_price } : {});
  return json(job);
}

import { getJob, saveJob, addLog, fireWebhook, noteWebhook, json } from '../../../../../lib/store';
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
  if (!process.env.GST_WEBHOOK_URL) addLog(job, 'Waiting for worker', 'approved');
  await saveJob(job);
  const res = await fireWebhook(job, 'approved', job.approved_price !== undefined ? { price: job.approved_price } : {});
  await noteWebhook(job.id, 'approved', res);
  return json(job);
}

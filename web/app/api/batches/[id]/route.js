import { list } from '@vercel/blob';
import { getJob, validId, json } from '../../../../lib/store';
export const dynamic = 'force-dynamic';
export async function GET(_req, { params }) {
  if (!validId(params.id)) return json({ error: 'bad id' }, 400);
  const { blobs } = await list({ prefix: `batches/${params.id}.json`, limit: 1 });
  if (!blobs.length) return json({ error: 'not found' }, 404);
  const b = await (await fetch(blobs[0].url, { cache: 'no-store' })).json();
  const jobs = await Promise.all(b.job_ids.map(async (id) => {
    const j = await getJob(id).catch(() => null);
    if (!j) return { id, stage: 'unknown' };
    const R = j.results || {};
    return { id, stage: j.stage, image_url: j.image_url, title: (R.listing && R.listing.title) || (R.identification && R.identification.name) || '', price: (R.listing && R.listing.price) ?? (R.price && R.price.recommended), listing_url: j.listing_url, test: !!j.test };
  }));
  return json({ ...b, jobs });
}

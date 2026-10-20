import { getJob, json } from '../../../../lib/store';
export const dynamic = 'force-dynamic';
export async function GET(_req, { params }) {
  const job = await getJob(params.id);
  if (!job) return json({ error: 'not found' }, 404);
  return json(job);
}

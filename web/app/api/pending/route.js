import { listPending, workerOk, json } from '../../../lib/store';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  if (!workerOk(req)) return json({ error: 'unauthorized' }, 401);
  const items = await listPending();
  items.sort((a, b) => (String(a.at) < String(b.at) ? -1 : 1));
  return json(items.map(({ job_id, kind, event }) => ({ job_id, kind, event })));
}

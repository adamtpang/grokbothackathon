import { put, list } from '@vercel/blob';
import { createHash } from 'crypto';
export const dynamic = 'force-dynamic';
const OK = [/(^|\.)fbcdn\.net$/i, /(^|\.)facebook\.com$/i, /(^|\.)ebayimg\.com$/i, /(^|\.)media-amazon\.com$/i, /(^|\.)ssl-images-amazon\.com$/i, /^recifmljuygjnq8v\.public\.blob\.vercel-storage\.com$/i];
const no = (s = 404) => new Response('no image', { status: s, headers: { 'cache-control': 'public, max-age=300' } });
export async function GET(req) {
  const u = new URL(req.url).searchParams.get('u') || '';
  let url; try { url = new URL(u); } catch (e) { return no(400); }
  if (url.protocol !== 'https:' || !OK.some((r) => r.test(url.hostname))) return no(403);
  if (/\.blob\.vercel-storage\.com$/i.test(url.hostname)) return Response.redirect(url.toString(), 302);
  const key = 'imgcache/' + createHash('sha1').update(url.toString()).digest('hex');
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    if (blobs.length) return new Response(null, { status: 302, headers: { location: blobs[0].url, 'cache-control': 'public, max-age=86400' } });
  } catch (e) {}
  try {
    const r = await fetch(url.toString(), { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept: 'image/*' }, signal: AbortSignal.timeout(8000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return no(404);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return no(413);
    const b = await put(key, buf, { access: 'public', contentType: type, addRandomSuffix: true });
    return new Response(null, { status: 302, headers: { location: b.url, 'cache-control': 'public, max-age=86400' } });
  } catch (e) { return no(404); }
}

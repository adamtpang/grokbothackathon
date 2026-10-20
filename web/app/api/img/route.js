export const dynamic = 'force-dynamic';
const OK = [/(^|\.)fbcdn\.net$/i, /(^|\.)facebook\.com$/i, /(^|\.)ebayimg\.com$/i, /(^|\.)media-amazon\.com$/i, /(^|\.)ssl-images-amazon\.com$/i, /^recifmljuygjnq8v\.public\.blob\.vercel-storage\.com$/i];
const no = (s = 404) => new Response('no image', { status: s, headers: { 'cache-control': 'public, max-age=300' } });
// Pure proxy: no Blob reads or writes. The CDN caches the response for a day.
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  let u = sp.get('u') || '';
  const fb = sp.get('fb') || '';
  if (!u && fb) {
    const m = fb.match(/^https:\/\/(www\.|m\.)?facebook\.com\/marketplace\/item\/(\d+)/i);
    if (!m) return no(400);
    try {
      const h = await (await fetch(`https://www.facebook.com/marketplace/item/${m[2]}/`, { headers: { 'user-agent': 'facebookexternalhit/1.1' }, signal: AbortSignal.timeout(6000) })).text();
      const og = h.match(/og:image" content="([^"]+)"/);
      if (!og) return no(404);
      u = og[1].replace(/&amp;/g, '&');
    } catch (e) { return no(404); }
  }
  let url; try { url = new URL(u); } catch (e) { return no(400); }
  if (url.protocol !== 'https:' || !OK.some((r) => r.test(url.hostname))) return no(403);
  if (/\.blob\.vercel-storage\.com$/i.test(url.hostname)) return Response.redirect(url.toString(), 302);
  try {
    const r = await fetch(url.toString(), { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept: 'image/*' }, signal: AbortSignal.timeout(8000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return no(404);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) return no(413);
    return new Response(buf, { status: 200, headers: { 'content-type': type, 'cache-control': 'public, max-age=86400, s-maxage=86400' } });
  } catch (e) { return no(404); }
}

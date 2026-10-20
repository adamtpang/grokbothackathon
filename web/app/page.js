'use client';
import { useEffect, useRef, useState } from 'react';

const ICONS = {
  chair: <path d="M7 4h10l-1 9H8zM6 13h12M12 13v5M8 21l4-3 4 3" />,
  bike: <><circle cx="6" cy="16" r="3.5" /><circle cx="18" cy="16" r="3.5" /><path d="M6 16l4-7h5l3 7M10 9l2 7" /></>,
  tv: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  lamp: <path d="M8 3h8l3 8H5zM12 11v8M8 21h8" />,
  guitar: <><circle cx="9" cy="15" r="5" /><path d="M12.5 11.5L20 4M17 4h3v3" /></>,
  sofa: <><path d="M4 11V8a2 2 0 012-2h12a2 2 0 012 2v3" /><rect x="2" y="11" width="20" height="6" rx="2" /><path d="M5 17v2M19 17v2" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  console: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><rect x="8.5" y="5" width="7" height="6" rx="1" /><path d="M8 16h3M9.5 14.5v3" /></>,
  desk: <path d="M3 8h18M5 8v12M19 8v12M5 13h7v7" />,
  speaker: <><rect x="6" y="3" width="12" height="18" rx="2" /><circle cx="12" cy="14" r="3" /><circle cx="12" cy="7.5" r="1" /></>,
  drill: <path d="M4 7h11l3 3h2v2h-2l-3 3H9l-1 6H5l1-6H4z" />,
  cooler: <><rect x="3" y="9" width="18" height="11" rx="2" /><path d="M5 9V7h14v2M3 13h18" /></>,
};
const TILES = [
  ['chair', 'Mesh office chair', 140, 260, '#1b2a44'], ['bike', 'Road bike, 56cm', 320, 410, '#2a1f3a'],
  ['tv', '55in 4K TV', 180, 240, '#132a2a'], ['lamp', 'Mid-century lamp', 35, 70, '#33261a'],
  ['guitar', 'Acoustic guitar', 90, 150, '#2b1a1a'], ['sofa', 'Sectional sofa', 400, 520, '#1d2633'],
  ['camera', 'Mirrorless camera', 450, 610, '#222'], ['console', 'Handheld console', 45, 95, '#1a2b1d'],
  ['desk', 'Standing desk', 150, 230, '#2a2a1a'], ['speaker', 'Bookshelf speakers', 60, 120, '#1a1f2e'],
  ['drill', 'Cordless drill kit', 55, 99, '#2e1d14'], ['cooler', '45 qt cooler', 120, 230, '#14262e'],
];

function MarketViz() {
  const box = useRef(null);
  const [scan, setScan] = useState([0, 5, 10]);
  const [pos, setPos] = useState([]);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const place = (s) => {
      const el = box.current; if (!el) return;
      const tiles = el.querySelectorAll('.t');
      setPos(s.map((i) => { const t = tiles[i]; if (!t || !t.offsetParent) return null; return { left: t.offsetLeft + t.offsetWidth - 20, top: t.offsetTop - 8 }; }));
    };
    place(scan);
    if (reduce) return;
    let cur = scan;
    const id = setInterval(() => {
      const visible = [...box.current.querySelectorAll('.t')].map((t, i) => (t.offsetParent ? i : -1)).filter((i) => i >= 0);
      cur = cur.map((c, k) => { let n; do { n = visible[Math.floor(Math.random() * visible.length)]; } while (cur.includes(n)); return n; });
      setScan(cur); place(cur);
    }, 1900);
    const onR = () => place(cur);
    window.addEventListener('resize', onR);
    return () => { clearInterval(id); window.removeEventListener('resize', onR); };
  }, []);
  return (
    <div className="viz" aria-label="Illustration of AI agents scanning Marketplace listings">
      <div className="vizbar"><span className="live"><i />Agents scanning Marketplace</span><span>Austin, TX</span></div>
      <div className="tiles" ref={box}>
        {TILES.map(([ic, nm, ask, mkt, bg], i) => (
          <div key={i} className={'t' + (scan.includes(i) ? ' scan' : '')}>
            <div className="ph" style={{ background: `radial-gradient(90% 90% at 30% 20%, ${bg}, #0d0d0f)` }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#9fb7e6" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{ICONS[ic]}</svg>
              <div className="cmp">${ask} vs <b>${mkt}</b> market</div>
            </div>
            <div className="meta"><div className="pr">${ask}</div><div className="nm">{nm}</div></div>
          </div>
        ))}
        {pos.map((p, k) => p && <div key={k} className="agent" style={p}>{['G', 'R', 'K'][k]}</div>)}
      </div>
      <div className="vizfoot">Illustration. Items and prices shown here are examples, not live listings.</div>
    </div>
  );
}

async function shrink(file) {
  try {
    const img = await createImageBitmap(file);
    const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch (e) { return file; }
}

export default function Home() {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const [q, setQ] = useState(''); const [max, setMax] = useState('');

  async function sell(file) {
    if (!file || !/^image\//.test(file.type)) { setErr('Please choose an image.'); return; }
    setErr(''); setBusy('sell');
    try {
      const f = await shrink(file);
      const fd = new FormData(); fd.append('image', f, f.name || 'photo.jpg');
      const r = await fetch('/api/jobs', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok || !j.id) throw new Error(j.error || 'Upload failed');
      location.href = `/job/${j.id}`;
    } catch (e) { setErr(String(e.message || e)); setBusy(''); }
  }
  async function buy(e) {
    e.preventDefault();
    if (!q.trim()) { setErr('Tell us what you are looking for.'); return; }
    setErr(''); setBusy('buy');
    try {
      const body = { kind: 'buy', query: q.trim() }; if (max) body.max_price = Number(max);
      const r = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || !j.id) throw new Error(j.error || 'Request failed');
      location.href = `/job/${j.id}`;
    } catch (e2) { setErr(String(e2.message || e2)); setBusy(''); }
  }
  const pick = (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; sell(f); };

  return (
    <main>
      <section className="hero"><div className="wrap hgrid">
        <div>
          <p className="eyebrow">Garage Sale Town · Grok Bot Hackathon · Austin</p>
          <h1>AI agents that buy and sell on Marketplace for you.</h1>
          <p className="sub">Snap a photo and Grok Bot agents identify it, research real prices, write the listing, and post it to Facebook Marketplace once you approve. Or tell them what you want and they hunt for under-market deals.</p>
          <div className="actions">
            <div id="sell" className={'act drag' + (over ? ' over' : '')}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); sell(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
              <h3>Sell</h3>
              <div className="row">
                <label className="pill blue big"><input type="file" accept="image/*" capture="environment" onChange={pick} disabled={!!busy} />{busy === 'sell' ? 'Uploading...' : 'Take photo'}</label>
                <label className="pill gray big"><input type="file" accept="image/*" onChange={pick} disabled={!!busy} />Upload photo</label>
              </div>
              <p className="hint">One photo is all it takes. On desktop you can also drop an image here.</p>
            </div>
            <form id="buy" className="act" onSubmit={buy}>
              <h3>Buy</h3>
              <div className="buyform">
                <input className="field" placeholder="What are you looking for?" value={q} onChange={(e) => setQ(e.target.value)} aria-label="What are you looking for?" />
                <input className="field" placeholder="Max $" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Max price" />
                <button className="pill blue" disabled={!!busy}>{busy === 'buy' ? 'Starting...' : 'Find deals'}</button>
              </div>
            </form>
            {err && <p className="err">{err}</p>}
          </div>
        </div>
        <MarketViz />
      </div></section>

      <section id="how" className="sec"><div className="wrap">
        <h2>How it works</h2>
        <div className="steps">
          <div className="card"><div className="n">1</div><h4>Identify</h4><p>A vision agent works out what the item is: brand, model and condition.</p></div>
          <div className="card"><div className="n">2</div><h4>Research prices</h4><p>Local Marketplace comps first. If there are fewer than 3, it widens to eBay sold, Amazon and other platforms.</p></div>
          <div className="card"><div className="n">3</div><h4>Write listing</h4><p>A detailed title, description and price grounded in the comps.</p></div>
          <div className="card"><div className="n">4</div><h4>Approve</h4><p>You review it and press approve. Nothing posts without you.</p></div>
          <div className="card"><div className="n">5</div><h4>Live</h4><p>Posted to Facebook Marketplace, with a QR code so you can check the real listing.</p></div>
        </div>
        <div className="steps" style={{ marginTop: 14 }}>
          <div className="card"><span className="tag">Buy</span><h4>Scouts find deals</h4><p>Agents scan Austin listings for what you want, compare each one against eBay sold, Amazon and others, and show the under-market ones with the comps to prove it.</p></div>
        </div>
      </div></section>
    </main>
  );
}

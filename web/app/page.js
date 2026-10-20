'use client';
import { useEffect, useRef, useState } from 'react';
import GarageScene from '../components/GarageScene';
import Photo, { prox } from '../components/Photo';
import ModeFeed from '../components/ModeFeed';

const TILES = [
  ['chair', 'Ergonomic office chair', 140, 260], ['airpods', 'AirPods Pro', 95, 160], ['lamp', 'Desk lamp', 15, 30], ['guitar', 'Acoustic guitar', 120, 210],
  ['sofa', 'Fabric sofa', 220, 380], ['camera', 'Mirrorless camera body', 900, 1250], ['drill', 'Cordless drill', 45, 85], ['cooler', 'Soft cooler bag', 110, 200],
];
const FEED = ['Scanning new Austin listings', 'Comparing with eBay sold', 'Checking Amazon price', 'Found 3 local comps', 'Flagged under-market listing', 'Drafting listing copy'];

const EXAMPLES = TILES.map(([ic, nm, ask, mkt]) => ({ photo: `/items/${ic}.jpg`, name: nm, ask, mkt }));
const r0 = (v) => (v === undefined || v === null || isNaN(Number(v)) ? undefined : Math.round(Number(v)));
function toTile(d, href) {
  return { href, photo: d.photo_url || d.image_url || d.image || null, name: d.title || 'Deal', ask: r0(d.ask_price ?? d.buy_price ?? d.price), mkt: r0(d.resale_price ?? d.resell_price ?? d.est_market_price), link: d.fb_url || d.source_url || d.link || d.url || null };
}
function useRealTiles() {
  const [tiles, setTiles] = useState(null);
  useEffect(() => {
    let stop = false;
    (async () => {
      const out = [];
      try { const f = await (await fetch('/api/deals', { cache: 'no-store' })).json(); if (f && !f.test) (f.deals || []).forEach((d, i) => { if (!d.example) out.push(toTile(d, `/deal/feed/${i}`)); }); } catch (e) {}
      try { const r = await (await fetch('/api/jobs?recent=1', { cache: 'no-store' })).json(); (r.jobs || []).filter((j) => j.kind === 'buy' && j.stage === 'done').forEach((j) => (j.deals || []).forEach((d, i) => out.push(toTile(d, `/deal/${j.id}/${i}`)))); } catch (e) {}
      if (!stop) setTiles(out.filter((x, i, a) => x.name && x.photo && a.findIndex((y) => y.photo === x.photo) === i).slice(0, 6));
    })();
    return () => { stop = true; };
  }, []);
  return tiles;
}

function MarketViz({ items, real }) {
  const box = useRef(null);
  const [scan, setScan] = useState(items.length > 3 ? [0, 5, 2] : items.map((_, i) => i).slice(0, Math.max(1, items.length - 1)));
  const [pos, setPos] = useState([]);
  const [tick, setTick] = useState(0);
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
      cur = cur.map((c, k) => { const opts = visible.filter((v) => !cur.includes(v)); const pool = opts.length ? opts : visible; return pool[Math.floor(Math.random() * pool.length)]; });
      setScan(cur); place(cur); setTick((x) => x + 1);
    }, 1900);
    const onR = () => place(cur);
    window.addEventListener('resize', onR);
    return () => { clearInterval(id); window.removeEventListener('resize', onR); };
  }, []);
  return (
    <div className="viz" aria-label="Illustration of AI agents scanning Marketplace listings">
      <div className="vizbar"><span className="live"><i />{real ? 'Deals Grok Bot found on Marketplace' : 'Grok Bot agents scanning Marketplace'}</span><span>Austin, TX</span></div>
      <div className="tiles" ref={box}>
        {items.map((it, i) => (
          <div key={i} className={'t' + (scan.includes(i) ? ' scan' : '')}>
            <a className="ph" href={it.href || it.link || undefined} target={!it.href && it.link ? '_blank' : undefined} rel="noopener">
              {real ? <Photo src={it.photo} title={it.name} fb={it.link} /> : <img src={it.photo} alt={it.name} loading="eager" />}
              {real ? <span className="realtag">Real</span> : <span className="extag">Example</span>}
              {it.mkt ? <div className="cmp">${it.ask} vs <b>${it.mkt}</b> market</div> : null}
            </a>
            <div className="meta"><div className="pr">{it.ask !== undefined && it.ask !== null ? '$' + it.ask : ''}</div><div className="nm">{it.name}</div>{it.link && <a className="vom" href={it.link} target="_blank" rel="noopener">View on Marketplace</a>}</div>
          </div>
        ))}
        {pos.map((p, k) => p && <div key={k} className="agent" style={p}>{['G', 'R', 'K'][k]}</div>)}
      </div>
      <div className="vizfoot"><span className="cursor" /> {FEED[tick % FEED.length]}... <span style={{ float: 'right' }}>{real ? 'Real deals found by Grok Bot scouts' : 'Example items and prices, not live listings'}</span></div>
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

export default function Home({ mode: initMode }) {
  const [mode, setMode] = useState(initMode === 'buy' ? 'buy' : 'sell');
  const real = useRealTiles();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const [q, setQ] = useState(''); const [max, setMax] = useState('');

  const [prog, setProg] = useState('');
  async function sell(fileList) {
    const files = [...(fileList || [])].filter((f) => /^image\//.test(f.type)).slice(0, 30);
    if (!files.length) { setErr('Please choose an image.'); return; }
    setErr(''); setBusy('sell');
    const test = new URLSearchParams(location.search).get('test') === '1';
    const batchId = files.length > 1 ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : '';
    const ids = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setProg(files.length > 1 ? `Uploading ${i + 1} of ${files.length}...` : 'Uploading...');
        const f = await shrink(files[i]);
        const fd = new FormData(); fd.append('image', f, f.name || 'photo.jpg');
        if (batchId) fd.append('batch_id', batchId);
        if (test) fd.append('test', '1');
        const r = await fetch('/api/jobs', { method: 'POST', body: fd });
        const j = await r.json();
        if (!r.ok || !j.id) throw new Error(j.error || 'Upload failed');
        ids.push(j.id);
      }
      if (ids.length === 1) { location.href = `/job/${ids[0]}`; return; }
      const r = await fetch('/api/batches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: batchId, job_ids: ids }) });
      const b = await r.json();
      location.href = `/batch/${b.id || batchId}`;
    } catch (e) { setErr(String(e.message || e) + (ids.length ? ` (${ids.length} uploaded)` : '')); setBusy(''); setProg(''); }
  }
  async function buy(e) {
    e.preventDefault();
    if (!q.trim()) { setErr('Tell us what you are looking for.'); return; }
    setErr(''); setBusy('buy');
    try {
      const body = { kind: 'buy', query: q.trim() }; if (max) body.max_price = Number(max); if (new URLSearchParams(location.search).get('test') === '1') body.test = 1;
      const r = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || !j.id) throw new Error(j.error || 'Request failed');
      location.href = `/job/${j.id}`;
    } catch (e2) { setErr(String(e2.message || e2)); setBusy(''); }
  }
  const pick = (e) => { const f = e.target.files; sell(f); e.target.value = ''; };

  return (
    <main>
      <section className="hero home-hero"><div className="wrap hgrid">
        <div>
          {initMode ? <><h1>{initMode === 'sell' ? 'Sell anything.' : 'Find flips.'}</h1>
          <p className="sub">{initMode === 'sell' ? 'One photo. Grok Bot writes and posts the listing.' : 'Say what you want. Grok Bot finds it under market.'}</p></> : <>
          <p className="eyebrow desk-only">Garage Sale · Grok Bot Hackathon · Austin</p>
          <h1>Snap it. <span style={{ color: "var(--blue2)" }}>Grok Bot sells it.</span></h1>
          <p className="sub">Photo in, Facebook Marketplace listing out. You approve every step.</p></>}
          <div className="actions">
            <div id={mode} className={'act onebox' + (mode === 'sell' && over ? ' drag over' : mode === 'sell' ? ' drag' : '')}
              onDragOver={(e) => { if (mode !== 'sell') return; e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { if (mode !== 'sell') return; e.preventDefault(); setOver(false); sell(e.dataTransfer.files); }}>
              <div className="mtog" role="tablist">
                <button type="button" role="tab" aria-selected={mode === 'buy'} className={mode === 'buy' ? 'on' : ''} onClick={() => setMode('buy')}>Buy</button>
                <button type="button" role="tab" aria-selected={mode === 'sell'} className={mode === 'sell' ? 'on' : ''} onClick={() => setMode('sell')}>Sell</button>
              </div>
              {mode === 'sell' ? <>
                <label className="bigbox sellbox"><input type="file" accept="image/*" multiple onChange={pick} disabled={!!busy} />
                  <span className="bbt">{busy === 'sell' ? (prog || 'Uploading...') : 'Drop photos or tap to add'}</span>
                  <span className="bbs">Each photo becomes a listing</span></label>
                <div className="row onerow">
                  <label className="pill blue big"><input type="file" accept="image/*" capture="environment" onChange={pick} disabled={!!busy} />{busy === 'sell' ? (prog || 'Uploading...') : 'Take photo'}</label>
                  <label className="pill gray big"><input type="file" accept="image/*" multiple onChange={pick} disabled={!!busy} />Attach photos</label>
                </div>
                <div className="chips">{['Headphones', 'Game console', 'Office chair', 'Old iPhone'].map((t) => <span key={t} className="chip0 hintchip">{t}</span>)}</div>
              </> : <form onSubmit={buy}>
                <div className="bigbox buybox">
                  <input className="bbin" placeholder="What do you want? e.g. Herman Miller chair" value={q} onChange={(e) => setQ(e.target.value)} aria-label="What are you looking for?" />
                  <div className="bbrow">
                    <input className="field" placeholder="Max $" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Max price" />
                    <button className="pill blue" disabled={!!busy}>{busy === 'buy' ? 'Starting...' : 'Find deals'}</button>
                  </div>
                </div>
                <div className="chips">{['Used Mac with Apple silicon under $500', 'Herman Miller chair to flip', 'Nintendo Switch under $200', 'Road bike under $300'].map((t) => <button type="button" key={t} className="chip0 btn" onClick={() => setQ(t)}>{t}</button>)}</div>
              </form>}
            </div>
            {err && <p className="err">{err}</p>}
            <a href="/dashboard" className="dashcta"><span><b>Dashboard</b><small>Your money, live</small></span><i>→</i></a>
          </div>
        </div>
        {!initMode && (real && real.length >= 3 ? <MarketViz key="real" items={real} real /> : <MarketViz key="ex" items={EXAMPLES} />)}
      </div>{!initMode && <div className="wrap"><GarageScene /></div>}</section>
      {initMode && <ModeFeed mode={initMode} />}

      {!initMode && <section id="how" className="sec"><div className="wrap">
        <h2>How it works</h2>
        <div className="steps">
          <div className="card"><div className="n">1</div><h4>Identify</h4><p>What is it?</p></div>
          <div className="card"><div className="n">2</div><h4>Price</h4><p>What is it worth?</p></div>
          <div className="card"><div className="n">3</div><h4>Write</h4><p>Title, price, details.</p></div>
          <div className="card"><div className="n">4</div><h4>Approve</h4><p>You say yes.</p></div>
          <div className="card"><div className="n">5</div><h4>Live</h4><p>On Marketplace.</p></div>
        </div>
        <div className="steps" style={{ marginTop: 14 }}>
          <div className="card"><span className="tag">Buy</span><h4>Scouts find deals</h4><p>Cheap finds near you.</p></div>
        </div>
        <div className="about">
          <h3>About</h3>
          <p className="aboutline">Snap it. Grok Bot sells it.</p>
          <div className="feats">
            <div className="card"><h4>Photo to listing</h4></div>
            <div className="card"><h4>Honest item ID</h4></div>
            <div className="card"><h4>Real prices</h4></div>
            <div className="card"><h4>24/7 deal scout</h4></div>
            <div className="card"><h4>Profit dashboard</h4></div>
            <div className="card"><h4>Buyer replies drafted</h4></div>
            <div className="card"><h4>You approve everything</h4></div>
          </div>
          <div className="card credits">
            <p><b>Built in 2.5 hours with Grok Bot.</b></p>
            <p><b>Built at</b> <a href="https://luma.com/x0qss5av?tk=Mdaf1N" target="_blank" rel="noreferrer">Grok Bot Hackathon</a>, Austin, TX, Oct 19, 2026</p>
            <p><b>Team</b> <a href="https://adampang.com" target="_blank" rel="noreferrer">Adam Pang</a> (<a href="https://github.com/adamtpang" target="_blank" rel="noreferrer">GitHub</a>), Pranav, Isaac</p>
            <p><b>Code</b> <a href="https://github.com/adamtpang/grokbothackathon" target="_blank" rel="noreferrer">github.com/adamtpang/grokbothackathon</a></p>
          </div>
        </div>
      </div></section>}
    </main>
  );
}

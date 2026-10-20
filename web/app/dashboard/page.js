'use client';
import { useEffect, useRef, useState } from 'react';
import Photo from '../../components/Photo';
const $ = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? '-' : '$' + Math.round(Number(v)).toLocaleString());
const LABEL = { received: 'Received', identifying: 'Identifying', researching: 'Researching', writing: 'Writing', awaiting_approval: 'Needs approval', approved: 'Approved', posting: 'Posting', live: 'Live' };
function Tick({ value }) {
  const [v, setV] = useState(0); const cur = useRef(0);
  useEffect(() => {
    const from = cur.current, to = Number(value) || 0, t0 = performance.now(), dur = 900;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cur.current = to; setV(to); return; }
    let raf; const step = (t) => { const k = Math.min(1, (t - t0) / dur); const x = from + (to - from) * (1 - Math.pow(1 - k, 3)); cur.current = x; setV(x); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{'$' + Math.round(v).toLocaleString()}</>;
}
function action(j) {
  if (j.question) return ['Answer a question', 'warn'];
  if (j.stage === 'awaiting_approval') return [`Approve at ${$(j.price)}`, 'go'];
  if (j.inquiries_drafted > 0) return ['Reply to buyer', 'go'];
  if (j.stage === 'live') return [`Live, ${j.inquiries || 0} message${j.inquiries === 1 ? '' : 's'}`, 'ok'];
  if (j.stage === 'approved' || j.stage === 'posting') return ['Posting now', 'ok'];
  return ['Agent working', 'dim'];
}
const num = (x) => (x === null || x === undefined || x === '' || isNaN(Number(x)) ? null : Number(x));
function srcName(x) { const s = String(x || '').toLowerCase(); if (s.includes('ebay')) return 'eBay'; if (s.includes('amazon')) return 'Amazon'; if (s.includes('facebook') || s.includes('marketplace')) return 'FB'; return x ? String(x).split(/[ (,]/)[0] : 'Resale'; }
function dealNums(d) {
  const comps = Array.isArray(d.comps) ? d.comps : [];
  const ask = num(d.ask_price ?? d.buy_price ?? d.price);
  const resell = num(d.resale_price ?? d.resell_price ?? d.est_market_price);
  const profit = num(d.est_profit) ?? (ask !== null && resell !== null ? Math.round((resell - ask) * 100) / 100 : null);
  let disc = num(d.discount_pct); if (disc !== null && disc > 0 && disc <= 1) disc *= 100;
  if (disc === null && ask !== null && resell) disc = (1 - ask / resell) * 100;
  const buyUrl = d.fb_url || d.source_url || d.link || d.url || null;
  const sellUrl = d.resale_url || d.resell_url || (comps[0] && comps[0].url) || null;
  const sellSrc = srcName(d.resale_source || d.resell_source || d.resell_platform || (comps[0] && comps[0].source));
  return { ask, resell, profit, disc, buyUrl, sellUrl, sellSrc };
}
export default function Dashboard() {
  const [jobs, setJobs] = useState(null); const [feed, setFeed] = useState(null);
  useEffect(() => {
    const load = async () => {
      try { const r = await fetch('/api/jobs?recent=1', { cache: 'no-store' }); const j = await r.json(); if (j.jobs) setJobs(j.jobs); } catch (e) {}
      try { const r = await fetch('/api/deals', { cache: 'no-store' }); setFeed(await r.json()); } catch (e) {}
    };
    load(); const t = setInterval(load, 30000); return () => clearInterval(t);
  }, []);
  const sells = (jobs || []).filter((j) => j.kind === 'sell');
  const buyJobs = (jobs || []).filter((j) => j.kind === 'buy');
  const deals = [
    ...((feed && feed.deals) || []).map((d, i) => ({ ...d, _src: 'Scout feed', _ex: !!(feed.test || d.example), _href: `/deal/feed/${i}` })),
    ...buyJobs.filter((b) => b.stage === 'done').flatMap((b) => (b.deals || []).map((d, i) => ({ ...d, _src: `For "${b.title}"`, _job: b.id, _href: `/deal/${b.id}/${i}` }))),
  ].map((d) => ({ ...d, _n: dealNums(d) })).filter((d) => d._n.profit !== null && d._n.profit > 0).sort((a, b) => (b._n.profit ?? -1e9) - (a._n.profit ?? -1e9));
  const sellTotal = sells.reduce((n, j) => n + (num(j.price) || 0), 0);
  const profitTotal = deals.filter((d) => !d._ex).reduce((n, d) => n + Math.max(0, dealNums(d).profit || 0), 0);
  const loading = jobs === null;
  const real = deals.filter((d) => !d._ex);
  const liveCount = sells.filter((j) => j.stage === 'live').length;
  const xp = sells.length * 20 + liveCount * 50 + real.length * 10 + Math.round(profitTotal / 10);
  const level = Math.floor(xp / 250) + 1, into = xp % 250;
  return <main className="wrap dash">
    <section className="mot">
      <div><p className="eyebrow">Money on the table</p><div className="motv"><Tick value={sellTotal + profitTotal} /></div></div>
      <div className="motk">
        <div><span>Your items</span><b><Tick value={sellTotal} /></b><small>{sells.length} listing{sells.length === 1 ? '' : 's'}</small></div>
        <div><span>Deal profit</span><b className="green"><Tick value={profitTotal} /></b><small>{deals.length} deal{deals.length === 1 ? '' : 's'}</small></div>
        <div><span>Last scouted</span><b style={{ fontSize: 18 }}>{feed && feed.updated_at ? new Date(feed.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Not yet'}</b><small>Austin, TX</small></div>
      </div>
    </section>
    <section className="trader">
      <div className="tav">G</div>
      <div className="tinfo"><b>Austin flipper</b><small>Level {level} trader</small>
        <div className="xp"><i style={{ width: `${(into / 250) * 100}%` }} /></div><small className="xpn">{into} / 250 XP to level {level + 1}</small></div>
      <div className="tstat"><span>Spread found</span><b className="green">+<Tick value={profitTotal} /></b></div>
      <div className="tstat"><span>Buys scouted</span><b>{real.length}</b></div>
      <div className="tstat"><span>Sells listed</span><b>{sells.length}</b><small>{liveCount} live</small></div>
    </section>
    <div className="board">
      <section className="bcol"><div className="bh"><h2>Sell</h2><a className="pill blue sm0" href="/sell">+ Sell</a></div>
        <div className="thead"><span>Item</span><span>Range</span><span>Price</span><span>Action</span></div>
        {loading && <div className="empty">Loading...</div>}
        {!loading && sells.length === 0 && <div className="empty">No items yet. <a href="/sell">Snap one</a>.</div>}
        {sells.map((j, k) => { const [a, cls] = action(j); return <a key={j.id} href={`/job/${j.id}`} className="trow" style={{ animationDelay: `${k * 50}ms` }}>
          <span className="it">{j.image_url ? <img src={j.image_url} alt="" /> : <i className="ph0" />}<span><b>{j.title || 'Identifying...'}</b><em className={'chip s-' + j.stage}>{LABEL[j.stage] || j.stage}</em></span></span>
          <span className="rg">{j.low !== null && j.high !== null ? `${$(j.low)}-${$(j.high)}` : '-'}</span>
          <span className="pr">{$(j.price)}</span>
          <span className={'ac ' + cls}>{a}</span></a>; })}
      </section>
      <section className="bcol"><div className="bh"><h2>Buy</h2><a className="pill gray sm0" href="/buy">Find deals</a></div>
        {feed === null && <div className="empty">Loading...</div>}
        {feed !== null && deals.length === 0 && <div className="empty">No deals yet.</div>}
        {deals.slice(0, 30).map((d, k) => { const n = d._n; const photo = d.photo_url || d.image_url || d.image; return <div key={k} className="trade tcard" style={{ animationDelay: `${k * 50}ms` }}>
          <a className="tph" href={d._href}><Photo src={photo} title={d.title} fb={(d.fb_url || d.source_url || d.link || d.url)} /></a><div className="tbody">
          <a className="it" href={d._href}><span><b>{d.title}</b><em className="chip s-src">{d._ex ? 'Example' : d._src}</em></span>{n.disc !== null && isFinite(n.disc) ? <small className="dsc">{Math.round(n.disc)}% under</small> : null}<i className="arrow">›</i></a>
          <div className="flip">
            <a className="leg buyl" href={n.buyUrl || undefined} target="_blank" rel="noopener"><span>Buy here</span><b>FB {$(n.ask)}</b></a>
            <i className="arrow">→</i>
            <a className="leg selll" href={n.sellUrl || undefined} target="_blank" rel="noopener"><span>Sell here</span><b>{n.resell !== null ? `${n.sellSrc} ${$(n.resell)}` : 'Check comps'}</b></a>
            <i className="arrow">=</i>
            {n.profit !== null ? <em className={'pchip big' + (n.profit < 0 ? ' neg' : '')}>{n.profit >= 0 ? '+' : ''}{$(n.profit)}{n.ask ? <small className="spct"> {Math.round((n.profit / n.ask) * 100)}%</small> : null}</em> : <em className="pchip big dim">?</em>}
          </div></div></div>; })}
      </section>
    </div>
    <section className="howflip"><h2>How to flip IRL</h2><div className="hf">
      <div><i>1</i><b>Message the seller</b></div>
      <div><i>2</i><b>Pick it up</b></div>
      <div><i>3</i><b><a href="/sell">Snap it to resell</a></b></div>
    </div></section>
  </main>;
}

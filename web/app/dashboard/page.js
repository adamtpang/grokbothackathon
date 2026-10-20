'use client';
import { useEffect, useRef, useState } from 'react';
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
function dealNums(d) {
  const ask = num(d.ask_price ?? d.buy_price ?? d.price);
  const resell = num(d.resell_price ?? d.est_market_price);
  const profit = num(d.est_profit) ?? (ask !== null && resell !== null ? resell - ask : null);
  let disc = num(d.discount_pct); if (disc !== null && disc > 0 && disc <= 1) disc *= 100;
  if (disc === null && ask !== null && resell) disc = (1 - ask / resell) * 100;
  return { ask, resell, profit, disc };
}
export default function Dashboard() {
  const [jobs, setJobs] = useState(null); const [feed, setFeed] = useState(null);
  useEffect(() => {
    const load = async () => {
      try { const r = await fetch('/api/jobs?recent=1', { cache: 'no-store' }); const j = await r.json(); if (j.jobs) setJobs(j.jobs); } catch (e) {}
      try { const r = await fetch('/api/deals', { cache: 'no-store' }); setFeed(await r.json()); } catch (e) {}
    };
    load(); const t = setInterval(load, 8000); return () => clearInterval(t);
  }, []);
  const sells = (jobs || []).filter((j) => j.kind === 'sell');
  const buyJobs = (jobs || []).filter((j) => j.kind === 'buy');
  const deals = [
    ...((feed && feed.deals) || []).map((d) => ({ ...d, _src: 'Scout feed', _ex: !!(feed.test || d.example) })),
    ...buyJobs.filter((b) => b.stage === 'done').flatMap((b) => (b.deals || []).map((d) => ({ ...d, _src: `For "${b.title}"`, _job: b.id }))),
  ].map((d) => ({ ...d, _n: dealNums(d) })).sort((a, b) => (b._n.profit ?? -1e9) - (a._n.profit ?? -1e9));
  const sellTotal = sells.reduce((n, j) => n + (num(j.price) || 0), 0);
  const profitTotal = deals.filter((d) => !d._ex).reduce((n, d) => n + Math.max(0, dealNums(d).profit || 0), 0);
  const loading = jobs === null;
  return <main className="wrap dash">
    <section className="mot">
      <div><p className="eyebrow">Money on the table</p><div className="motv"><Tick value={sellTotal + profitTotal} /></div>
        <p className="muted small">Recommended prices of your items plus estimated profit on scouted deals.</p></div>
      <div className="motk">
        <div><span>Your items</span><b><Tick value={sellTotal} /></b><small>{sells.length} listing{sells.length === 1 ? '' : 's'}</small></div>
        <div><span>Deal profit</span><b className="green"><Tick value={profitTotal} /></b><small>{deals.length} deal{deals.length === 1 ? '' : 's'}</small></div>
        <div><span>Last scouted</span><b style={{ fontSize: 18 }}>{feed && feed.updated_at ? new Date(feed.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Not yet'}</b><small>Austin, TX</small></div>
      </div>
    </section>
    <div className="board">
      <section className="bcol"><div className="bh"><h2>Sell</h2><a className="pill blue sm0" href="/#sell">+ Sell</a></div>
        <div className="thead"><span>Item</span><span>Range</span><span>Price</span><span>Action</span></div>
        {loading && <div className="empty">Loading...</div>}
        {!loading && sells.length === 0 && <div className="empty">No items yet. <a href="/#sell">Snap one</a>.</div>}
        {sells.map((j, k) => { const [a, cls] = action(j); return <a key={j.id} href={`/job/${j.id}`} className="trow" style={{ animationDelay: `${k * 50}ms` }}>
          <span className="it">{j.image_url ? <img src={j.image_url} alt="" /> : <i className="ph0" />}<span><b>{j.title || 'Identifying...'}</b><em className={'chip s-' + j.stage}>{LABEL[j.stage] || j.stage}</em></span></span>
          <span className="rg">{j.low !== null && j.high !== null ? `${$(j.low)}-${$(j.high)}` : '-'}</span>
          <span className="pr">{$(j.price)}</span>
          <span className={'ac ' + cls}>{a}</span></a>; })}
      </section>
      <section className="bcol"><div className="bh"><h2>Buy</h2><a className="pill gray sm0" href="/#buy">Find deals</a></div>
        <div className="thead"><span>Deal</span><span>Buy / Resell</span><span>Profit</span><span>Action</span></div>
        {feed === null && <div className="empty">Loading...</div>}
        {feed !== null && deals.length === 0 && <div className="empty">No deals yet. Scouts post here as they find them.</div>}
        {deals.slice(0, 30).map((d, k) => { const n = d._n; const link = d.fb_url || d.source_url || d.link || d.url; const photo = d.photo_url || d.image_url || d.image; return <div key={k} className="trow" style={{ animationDelay: `${k * 50}ms` }}>
          <span className="it">{photo ? <img src={photo} alt="" /> : <i className="ph0" />}<span><b>{d.title}</b><em className="chip s-src">{d._ex ? 'Example' : d._src}</em></span></span>
          <span className="rg">{$(n.ask)} <i className="arrow">→</i> {$(n.resell)}{d.resell_source ? <small> {d.resell_source}</small> : null}</span>
          <span className="pr">{n.profit !== null ? <em className={'pchip' + (n.profit < 0 ? ' neg' : '')}>{n.profit >= 0 ? '+' : ''}{$(n.profit)}</em> : '-'}{n.disc !== null && isFinite(n.disc) ? <small className="dsc">{Math.round(n.disc)}% under</small> : null}</span>
          <span className="ac go">{link ? <a href={link} target="_blank" rel="noopener">View on Marketplace</a> : d._job ? <a href={`/job/${d._job}`}>Open</a> : '-'}</span></div>; })}
      </section>
    </div>
  </main>;
}

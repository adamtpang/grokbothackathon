'use client';
import { useEffect, useRef, useState } from 'react';

const STAGES = {
  sell: ['received', 'identifying', 'researching', 'writing', 'awaiting_approval', 'approved', 'posting', 'live'],
  buy: ['received', 'scouting', 'comparing', 'done'],
};
const LABEL = { received: 'Received', identifying: 'Identifying', researching: 'Researching', writing: 'Writing', awaiting_approval: 'Your approval', approved: 'Approved', posting: 'Posting', live: 'Live', scouting: 'Scouting', comparing: 'Comparing', done: 'Done' };
const money = (v) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? (v ?? '') : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const t = (ts) => { try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) { return ''; } };
function badge(src) {
  const s = String(src || '').toLowerCase();
  if (s.includes('fb') || s.includes('facebook') || s.includes('marketplace')) return ['FB', 'b-fb'];
  if (s.includes('ebay')) return ['eBay', 'b-ebay'];
  if (s.includes('amazon')) return ['Amazon', 'b-amazon'];
  return [src || 'Web', 'b-other'];
}
const pct = (v) => { const n = Number(v); if (isNaN(n)) return ''; return Math.round(n <= 1 && n > 0 ? n * 100 : n) + '%'; };

function Stepper({ kind, stage }) {
  const list = STAGES[kind] || STAGES.sell;
  const i = list.indexOf(stage);
  return <div className="stepper">{list.map((s, k) => (
    <div key={s} className={'st' + (k < i || (k === i && (s === 'live' || s === 'done')) ? ' done' : k === i ? ' cur' : '')}><i>{k < i ? '✓' : k + 1}</i>{LABEL[s] || s}</div>
  ))}{i < 0 && stage ? <div className="st cur"><i>•</i>{stage}</div> : null}</div>;
}

function Log({ logs }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs.length]);
  return <div className="term" ref={ref}>{logs.length === 0 && <div className="ln">waiting for the first event...</div>}
    {logs.map((l, k) => <div key={k} className={'ln ' + (l.source || '') + (k === logs.length - 1 ? ' new' : '')}>
      <span className="ts">{t(l.ts)}</span> <span className="sg">[{l.stage || '-'}]</span> {l.message}</div>)}</div>;
}

function Price({ p }) {
  const lo = Number(p.low), hi = Number(p.high);
  const at = (v) => (hi > lo ? Math.min(100, Math.max(0, ((Number(v) - lo) / (hi - lo)) * 100)) : 50);
  return <div>
    {p.recommended !== undefined && <div className="rec-p">{money(p.recommended)}<small>recommended</small></div>}
    {!isNaN(lo) && !isNaN(hi) && <><div className="range">
      {p.median !== undefined && <div className="mk" style={{ left: at(p.median) + '%' }}><span>median {money(p.median)}</span></div>}
      {p.recommended !== undefined && <div className="mk rec" style={{ left: at(p.recommended) + '%' }} />}
    </div><div className="rlbl"><span>Low {money(p.low)}</span><span>High {money(p.high)}</span></div></>}
    {p.rationale && <p className="rat">{p.rationale}</p>}
  </div>;
}

function Listing({ l, img }) {
  const tags = Array.isArray(l.tags) ? l.tags : typeof l.tags === 'string' ? l.tags.split(',') : [];
  return <div className="mp">
    {img && <img src={img} alt="" />}
    <div className="bd">
      <h2>{l.title}</h2><div className="mpp">{money(l.price)}</div>
      <div className="sm">Listed just now in Austin, TX</div>
      <h5>Details</h5>
      <div className="det">{l.condition && <><span>Condition</span><span>{l.condition}</span></>}{l.category && <><span>Category</span><span>{l.category}</span></>}</div>
      {l.description && <p className="desc">{l.description}</p>}
      {tags.length > 0 && <div className="chips">{tags.map((x, k) => <span key={k}>{String(x).trim()}</span>)}</div>}
    </div>
  </div>;
}

export default function JobPage({ params }) {
  const { id } = params;
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  const [price, setPrice] = useState('');
  const [approving, setApproving] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const priceTouched = useRef(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/jobs/${id}`, { cache: 'no-store' });
        if (r.status === 404) { setErr('Job not found.'); return; }
        const j = await r.json(); if (!stop) { setJob(j); setErr(''); }
      } catch (e) { if (!stop) setErr('Reconnecting...'); }
    };
    load();
    const a = setInterval(load, 1500), b = setInterval(() => setTick(Date.now()), 5000);
    return () => { stop = true; clearInterval(a); clearInterval(b); };
  }, [id]);

  const R = (job && job.results) || {};
  useEffect(() => {
    if (priceTouched.current) return;
    const v = (R.listing && R.listing.price) ?? (R.price && R.price.recommended);
    if (v !== undefined && v !== null) setPrice(String(v));
  }, [job]);

  async function approve() {
    setApproving(true);
    try {
      const r = await fetch(`/api/jobs/${id}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(price !== '' ? { price: Number(price) } : {}) });
      const j = await r.json(); if (r.ok) setJob(j); else setErr(j.error || 'Approve failed');
    } finally { setApproving(false); }
  }

  if (!job) return <main className="wrap"><div className="jobhead"><h1>{err || 'Loading job...'}</h1></div></main>;
  const logs = job.logs || [];
  const workerSeen = logs.some((l) => l.source === 'worker') || job.stage !== 'received';
  const age = (tick - new Date(job.created_at).getTime()) / 1000;
  const listingUrl = job.listing_url || R.listing_url;
  const deals = Array.isArray(R.deals) ? [...R.deals].sort((a, b) => Number(b.discount_pct || 0) - Number(a.discount_pct || 0)) : [];
  const idf = R.identification;
  const comps = Array.isArray(R.comps) ? R.comps : [];

  return <main className="wrap">
    <div className="jobhead">
      <div><p className="eyebrow">{job.kind === 'buy' ? 'Buy request' : 'Sell job'}</p>
        <h1>{job.kind === 'buy' ? `Finding: ${job.query}${job.max_price ? ` under ${money(job.max_price)}` : ''}` : (R.listing && R.listing.title) || (idf && idf.name) || 'Selling your item'}</h1></div>
      <span className="jid">job {job.id}</span>
    </div>
    <Stepper kind={job.kind} stage={job.stage} />
    {!workerSeen && <div className="wait"><span className="spin" /><div>Grok Bot worker is picking this up...
      {age > 60 && <small>The worker is still starting. This can take a minute; this page updates on its own.</small>}</div></div>}
    {err && <p className="err">{err}</p>}

    <div className="jgrid">
      <div className="col">
        {job.stage === 'awaiting_approval' && job.kind === 'sell' && <div className="panel approve">
          <h3>Ready to post</h3>
          <p className="muted" style={{ marginBottom: 14 }}>Check the listing below. Adjust the price if you like, then approve.</p>
          <div className="row">
            <input className="field" inputMode="decimal" value={price} onChange={(e) => { priceTouched.current = true; setPrice(e.target.value.replace(/[^0-9.]/g, '')); }} aria-label="Price" placeholder="$" />
            <button className="pill blue big" onClick={approve} disabled={approving}>{approving ? 'Approving...' : 'Approve and post to Marketplace'}</button>
          </div>
        </div>}
        {listingUrl && <div className="panel livep">
          <h3 style={{ justifyContent: 'center' }}>Live on Marketplace</h3>
          <a className="pill blue big" href={listingUrl} target="_blank" rel="noopener">Open the listing</a>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=0&data=${encodeURIComponent(listingUrl)}`} alt="QR code to the listing" />
          <p className="small muted" style={{ wordBreak: 'break-all' }}>{listingUrl}</p>
        </div>}
        {R.listing && <div className="panel"><h3>Listing preview</h3><Listing l={R.listing} img={job.image_url} /></div>}
        {job.kind === 'buy' && <div className="panel"><h3>Deals {deals.length > 0 && <span>{deals.length}</span>}</h3>
          {deals.length === 0 ? <p className="muted">Scouts are looking. Deals appear here as they are found.</p> :
            <div className="deals">{deals.map((d, k) => <div key={k} className="deal">
              <div>
                <a className="dt" href={d.link || '#'} target="_blank" rel="noopener">{d.title}</a>
                {d.rationale && <p className="small muted" style={{ marginTop: 6 }}>{d.rationale}</p>}
                {Array.isArray(d.comps) && d.comps.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{d.comps.map((c, j) => { const [b, cl] = badge(c.source); return <a key={j} href={c.link || '#'} target="_blank" rel="noopener" className={'badge ' + cl}>{b} {money(c.price)}</a>; })}</div>}
              </div>
              <div style={{ textAlign: 'right' }}><div className="ask">{money(d.ask_price)}</div><div className="mkt">{money(d.est_market_price)}</div>{d.discount_pct !== undefined && <span className="off">{pct(d.discount_pct)} under</span>}</div>
            </div>)}</div>}
        </div>}
        {R.price && <div className="panel"><h3>Price research</h3><Price p={R.price} /></div>}
        {comps.length > 0 && <div className="panel"><h3>Comparables <span>{comps.length}</span></h3><div className="comps">
          {comps.map((c, k) => { const [b, cl] = badge(c.source); return <a key={k} className="comp" href={c.link || c.url || '#'} target="_blank" rel="noopener">
            <span className={'badge ' + cl}>{b}</span><div className="ct">{c.title}</div><div className="cp">{money(c.price)}</div></a>; })}
        </div></div>}
      </div>
      <div className="col">
        {job.image_url && <div className="panel"><h3>Photo</h3><img className="photo" src={job.image_url} alt="Item photo" /></div>}
        {idf && <div className="panel"><h3>Identification</h3><dl className="kv">
          {['name', 'brand', 'model', 'condition'].map((k) => idf[k] ? [<dt key={k + 't'}>{k[0].toUpperCase() + k.slice(1)}</dt>, <dd key={k}>{String(idf[k])}</dd>] : null)}
          {idf.details && <><dt>Details</dt><dd>{typeof idf.details === 'string' ? idf.details : Array.isArray(idf.details) ? idf.details.join(', ') : JSON.stringify(idf.details)}</dd></>}
        </dl></div>}
        <div className="panel"><h3>Live activity <span className="small">{logs.length} events</span></h3><Log logs={logs} /></div>
      </div>
    </div>
  </main>;
}

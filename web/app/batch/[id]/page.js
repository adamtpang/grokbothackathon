'use client';
import { useEffect, useState } from 'react';
const LABEL = { received: 'Received', identifying: 'Identifying', researching: 'Researching', writing: 'Writing', awaiting_approval: 'Needs your approval', approved: 'Approved', posting: 'Posting', live: 'Live', unknown: 'Unknown' };
export default function Batch({ params }) {
  const [b, setB] = useState(null); const [err, setErr] = useState('');
  useEffect(() => {
    let stop = false;
    const load = async () => { try { const r = await fetch(`/api/batches/${params.id}`, { cache: 'no-store' }); const j = await r.json(); if (!stop) { if (r.ok) setB(j); else setErr(j.error || 'Not found'); } } catch (e) {} };
    load(); const t = setInterval(load, 3000); return () => { stop = true; clearInterval(t); };
  }, [params.id]);
  if (!b) return <main className="wrap"><div className="jobhead"><h1>{err || 'Loading batch...'}</h1></div></main>;
  const live = b.jobs.filter((j) => j.stage === 'live').length;
  const need = b.jobs.filter((j) => j.stage === 'awaiting_approval').length;
  return <main className="wrap">
    <div className="jobhead"><div><p className="eyebrow">Bulk sell</p><h1>{b.jobs.length} items</h1>
      <p className="muted" style={{ marginTop: 6 }}>{live} live · {need} need your approval · each item has its own agent</p></div><span className="jid">batch {b.id}</span></div>
    <div className="blist" style={{ marginTop: 20 }}>{b.jobs.map((j) => <a key={j.id} className="bitem" href={`/job/${j.id}`}>
      {j.image_url ? <img src={j.image_url} alt="" /> : <div className="noimg" style={{ width: 72, height: 72, borderRadius: 12 }} />}
      <div><div style={{ fontWeight: 700 }}>{j.title || 'Identifying...'}</div><div className="small muted">{j.price !== undefined && j.price !== null ? `$${j.price} · ` : ''}job {j.id}{j.test ? ' · test' : ''}</div></div>
      <span className={'spill ' + j.stage}>{LABEL[j.stage] || j.stage}</span></a>)}</div>
  </main>;
}

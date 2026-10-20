'use client';
import { useEffect, useState } from 'react';
import Photo from '../../components/Photo';
const LABEL = { drafting: 'Drafting', writing: 'Drafting', awaiting_approval: 'Your approval', approved: 'Approved', posting: 'Posting', live: 'Live' };
const ago = (ts) => { if (!ts) return ''; const s = Math.round((Date.now() - new Date(ts)) / 1000); if (s < 60) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return new Date(ts).toLocaleDateString(); };
const STEPS = { sell: ['New message', 'Negotiating', 'Price agreed', 'Pickup set', 'Sold'], buy: ['Seller contacted', 'Negotiating', 'Price agreed', 'Pickup set', 'Bought'] };
const STAGE_KEYS = [['new', 'contacted', 'message'], ['negotiat', 'counter', 'offer'], ['agreed', 'accept'], ['pickup'], ['sold', 'bought', 'done', 'complete']];
function stepOf(q) {
  if (q.deal_stage) { const d = String(q.deal_stage).toLowerCase(); const i = STAGE_KEYS.findIndex((ks) => ks.some((k) => d.includes(k))); if (i >= 0) return i; }
  const offer = q.offer_price !== undefined && q.offer_price !== null;
  if (q.status === 'new' || q.status === 'drafted') return offer ? 1 : 0;
  return 1;
}
const r5 = (n) => Math.round(n / 5) * 5;
function nextStep(q, ask, step) {
  const offer = q.offer_price !== undefined && q.offer_price !== null ? Number(q.offer_price) : null;
  const pk = [q.pickup_place, q.pickup_time].filter(Boolean).join(', ');
  if (step >= 4) return 'Done. Mark it sold.';
  if (offer !== null && ask > 0 && step < 2) return offer < ask * 0.85 ? `Counter at $${r5((offer + ask) / 2).toLocaleString()}` : `Accept and confirm pickup${pk ? ` at ${pk}` : ''}`;
  if (pk && step < 3) return `Confirm pickup at ${pk}`;
  if (q.status === 'sent' || q.status === 'sending') return `Waiting on ${q.buyer_name || 'the buyer'}. Nudge in 24h if no reply`;
  return 'Review the draft and send';
}
export default function Conversations() {
  const [jobs, setJobs] = useState(null); const [full, setFull] = useState({}); const [drafts, setDrafts] = useState({}); const [sending, setSending] = useState(''); const [err, setErr] = useState(''); const [hl, setHl] = useState('');
  useEffect(() => {
    let alive = true;
    try { const h = new URLSearchParams(location.search).get('hl'); if (h) { setHl(h); setTimeout(() => alive && setHl(''), 4000); } } catch (e) {}
    const load = async () => {
      try {
        const j = await (await fetch('/api/jobs?recent=1', { cache: 'no-store' })).json();
        if (!alive || !j.jobs) return; setJobs(j.jobs);
        const withMsgs = j.jobs.filter((x) => Number(x.inquiries) > 0);
        const got = await Promise.all(withMsgs.map(async (x) => { try { return await (await fetch(`/api/jobs/${x.id}`, { cache: 'no-store' })).json(); } catch (e) { return null; } }));
        if (alive) setFull((f) => { const n = { ...f }; got.forEach((g) => { if (g && g.id) n[g.id] = g; }); return n; });
      } catch (e) {}
    };
    load(); const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  async function sendReply(jobId, q) {
    setSending(q.id); setErr('');
    try {
      const r = await fetch(`/api/jobs/${jobId}/replies/${encodeURIComponent(q.id)}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: drafts[q.id] ?? q.draft_reply }) });
      const j = await r.json(); if (r.ok && j && j.id) { setFull((f) => ({ ...f, [j.id]: j })); setHl(q.id); setTimeout(() => setHl(''), 4000); } else setErr((j && j.error) || 'Request failed');
    } catch (e) { setErr('Request failed'); }
    setSending('');
  }
  const sells = (jobs || []).filter((j) => j.kind === 'sell' && !j.test);
  const threads = (jobs || []).filter((j) => !j.test).map((j) => ({ j, f: full[j.id], inqs: (full[j.id] && Array.isArray(full[j.id].inquiries)) ? full[j.id].inquiries : [] })).filter((t) => t.inqs.length > 0);
  const tx = sells.filter((j) => ['writing', 'awaiting_approval', 'approved', 'posting', 'live'].includes(j.stage));
  return <main className="wrap cv">
    <p className="eyebrow">Inbox</p><h1>Messages</h1>
    {tx.length > 0 && <div className="txs">{tx.map((j) => <a key={j.id} className="tx" href={j.listing_url || `/job/${j.id}`} target={j.listing_url ? '_blank' : undefined} rel="noopener">
      <span className="txph"><Photo src={j.image_url} title={j.title} /></span>
      <span className="txb"><b>{j.title || 'Item'}</b><em className={'chip s-' + j.stage}>{LABEL[j.stage] || j.stage}</em></span>
    </a>)}</div>}
    {err && <div className="unsure">{err}</div>}
    {jobs === null ? <div className="empty cvempty">Loading...</div> : threads.length === 0 ? <div className="card cvempty">No buyer messages yet. Grok Bot checks your Marketplace inbox and drafts replies for you to approve.</div> :
      <div className="cvlist">{threads.map(({ j, f, inqs }) => <section key={j.id} className="card cvjob">
        <div className="cvh"><a className="txph" href={`/job/${j.id}`}><Photo src={j.image_url} title={j.title} /></a>
          <div className="cvt"><a href={`/job/${j.id}`}><b>{j.title || 'Item'}</b></a>{j.listing_url && <a className="small" href={j.listing_url} target="_blank" rel="noopener">View listing</a>}</div></div>
        <div className="inqs">{inqs.map((q) => <div key={q.id} id={'inq-' + q.id} className={'inq' + (hl === q.id ? ' inqhl' : '')}>
          <div className="inqh"><b>{q.buyer_name || 'Buyer'} <small className="muted">{q.sent_at ? 'replied ' + ago(q.sent_at) : ''}</small></b><span className={'ist ' + q.status}>{q.status === 'new' ? 'New' : q.status === 'drafted' ? 'Drafted, awaiting approval' : q.status === 'sending' ? 'Sending...' : 'Sent'}</span></div>
          <div className="small muted">{j.title || 'Item'} · received {ago(q.ts)}</div>
          {(() => { const st = stepOf(q); const steps = STEPS[j.kind === 'buy' ? 'buy' : 'sell']; return <>
            <ol className="stepper">{steps.map((t, i) => <li key={t} className={i < st ? 'done' : i === st ? 'cur' : ''}><i />{t}</li>)}</ol>
            <div className="nextstep"><b>Recommended next step</b><span>{nextStep(q, Number(j.price) || 0, st)}</span><small>Meet in a public place, cash or Zelle on pickup.</small></div>
          </>; })()}
          <div className="bmsg">{q.message}</div>
          {(q.intent || q.offer_price !== undefined || q.pickup_time || q.pickup_place) && <div className="chips" style={{ marginTop: 0 }}>
            {q.intent && <span className="chip0 qchip">{q.intent}</span>}
            {q.offer_price !== undefined && q.offer_price !== null && <span className="chip0 qchip offer">Offer ${Number(q.offer_price).toLocaleString()}</span>}
            {q.pickup_time && <span className="chip0 qchip">{q.pickup_time}</span>}
            {q.pickup_place && <span className="chip0 qchip">{q.pickup_place}</span>}
          </div>}
          {q.status === 'drafted' ? <>
            <textarea className="field ta" rows={3} value={drafts[q.id] ?? q.draft_reply ?? ''} onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })} aria-label="Reply" />
            <button className="pill blue sm" onClick={() => sendReply(j.id, q)} disabled={sending === q.id}>{sending === q.id ? 'Sending...' : 'Approve & send'}</button>
          </> : <div className="rmsg">{q.approved_text || q.draft_reply}</div>}
        </div>)}</div>
      </section>)}</div>}
  </main>;
}

'use client';
import { useEffect, useState } from 'react';
import Photo from './Photo';
const $ = (v) => '$' + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
export default function ModeFeed({ mode }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        if (mode === 'sell') {
          const r = await (await fetch('/api/jobs?recent=1', { cache: 'no-store' })).json();
          setItems((r.jobs || []).filter((j) => j.kind === 'sell' && !j.test && j.stage === 'live').slice(0, 8).map((j) => ({ key: j.id, href: `/job/${j.id}`, photo: j.image_url, title: j.title, top: $(j.price), sub: 'Live' })));
        } else {
          const f = await (await fetch('/api/deals', { cache: 'no-store' })).json();
          const ds = ((f && f.deals) || []).map((d, i) => { const a = Number(d.ask_price ?? d.buy_price ?? d.price); const r = Number(d.resale_price ?? d.resell_price ?? d.est_market_price); const p = d.est_profit !== undefined && d.est_profit !== null && d.est_profit !== '' ? Number(d.est_profit) : r - a; return { d, i, a, p }; })
            .filter((x) => !x.d.example && isFinite(x.p) && x.p > 0).sort((x, y) => y.p - x.p).slice(0, 8);
          setItems(ds.map(({ d, i, a, p }) => ({ key: i, href: `/deal/feed/${i}`, photo: d.photo_url || d.image_url || d.image, fb: d.fb_url || d.source_url || d.link || d.url, title: d.title, top: $(a), sub: `+${$(p)} profit` })));
        }
      } catch (e) { setItems([]); }
    })();
  }, [mode]);
  return <section className="sec mfeed"><div className="wrap">
    <div className="mfh"><h2>{mode === 'sell' ? 'Live now' : 'Top flips'}</h2><a className="pill gray sm0" href="/dashboard">Dashboard</a></div>
    {items === null ? <p className="muted">Loading...</p> : items.length === 0 ? <p className="muted">{mode === 'sell' ? 'No live listings yet.' : 'No flips found yet.'}</p> :
      <div className="mgrid">{items.map((x) => <a key={x.key} className="mcard" href={x.href}>
        <span className="mph"><Photo src={x.photo} title={x.title} fb={x.fb} /></span>
        <span className="mtx"><b className="mp">{x.top}</b><span className="mt">{x.title}</span><small className={mode === 'sell' ? 'mlive' : 'mprof'}>{x.sub}</small></span>
      </a>)}</div>}
  </div></section>;
}

'use client';
import { useEffect, useState } from 'react';
import DealCard from '../../components/DealCard';
const ago = (ts) => { if (!ts) return ''; const s = Math.round((Date.now() - new Date(ts)) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.round(s / 60)} min ago`; return new Date(ts).toLocaleString(); };
export default function Deals() {
  const [f, setF] = useState(null); const [, setT] = useState(0);
  useEffect(() => {
    const load = async () => { try { const r = await fetch('/api/deals', { cache: 'no-store' }); setF(await r.json()); } catch (e) {} };
    load(); const a = setInterval(load, 15000), b = setInterval(() => setT((x) => x + 1), 5000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);
  const deals = f && Array.isArray(f.deals) ? [...f.deals].sort((a, b) => Number(b.discount_pct || 0) - Number(a.discount_pct || 0)) : [];
  return <main className="wrap">
    <div className="jobhead"><div><p className="eyebrow">Scout feed · {(f && f.area) || 'Austin, TX'}</p><h1>Under-market deals</h1>
      <p className="muted" style={{ marginTop: 6 }}>{!f ? 'Loading...' : f.updated_at ? `Last scouted ${ago(f.updated_at)}` : 'No scout run yet. Deals appear here after the first scout.'}</p></div>
      <a className="pill blue" href="/#buy">Find something specific</a></div>
    {deals.length > 0 && <div className="dgrid" style={{ marginTop: 20 }}>{deals.map((d, k) => <DealCard key={k} d={d} example={!!(f.test || d.example)} />)}</div>}
  </main>;
}

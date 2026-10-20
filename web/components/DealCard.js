const money = (v) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? (v ?? '') : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }));
const pct = (v) => { const n = Number(v); if (isNaN(n)) return ''; return Math.round(n <= 1 && n > 0 ? n * 100 : n) + '%'; };
export function badge(src) {
  const s = String(src || '').toLowerCase();
  if (s.includes('fb') || s.includes('facebook') || s.includes('marketplace')) return ['FB', 'b-fb'];
  if (s.includes('ebay')) return ['eBay', 'b-ebay'];
  if (s.includes('amazon')) return ['Amazon', 'b-amazon'];
  return [src || 'Web', 'b-other'];
}
export default function DealCard({ d, example }) {
  const link = d.fb_url || d.link || d.url;
  const photo = d.photo_url || d.image_url || d.image;
  const ask = d.ask_price ?? d.buy_price ?? d.price;
  const resell = d.resell_price ?? d.est_market_price;
  const profit = d.est_profit ?? (resell !== undefined && ask !== undefined && !isNaN(resell - ask) ? Number(resell) - Number(ask) : undefined);
  const disc = d.discount_pct ?? (resell && ask ? (1 - ask / resell) * 100 : undefined);
  const [rb, rc] = badge(d.resell_source || d.resell_platform || '');
  return <div className="dcard">
    <a className="dimg" href={link || undefined} target="_blank" rel="noopener">
      {photo ? <img src={photo} alt={d.title || ''} loading="lazy" /> : <div className="noimg" />}
      {example && <span className="extag">Example</span>}
      {disc !== undefined && !isNaN(disc) && <span className="off abs">{pct(disc)} under</span>}
    </a>
    <div className="dbody">
      <div className="dprice">{money(ask)}{d.est_market_price !== undefined && <span className="mkt"> {money(d.est_market_price)}</span>}</div>
      <a className="dt" href={link || undefined} target="_blank" rel="noopener">{d.title}</a>
      {d.location && <div className="small muted">{d.location}</div>}
      {(resell !== undefined || profit !== undefined) && <div className="arb">
        <div><span>Buy</span><b>{money(ask)}</b></div>
        <div><span>Resell{d.resell_source ? '' : ''}</span>{d.resell_url ? <a href={d.resell_url} target="_blank" rel="noopener"><b>{money(resell)}</b> <i className={'badge ' + rc}>{rb}</i></a> : <b>{money(resell)}</b>}</div>
        {profit !== undefined && !isNaN(profit) && <div><span>Est. profit</span><b className="green">{money(profit)}</b></div>}
      </div>}
      {Array.isArray(d.comps) && d.comps.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{d.comps.slice(0, 5).map((c, j) => { const [b, cl] = badge(c.source); return <a key={j} href={c.link || c.url || undefined} target="_blank" rel="noopener" className={'badge ' + cl}>{b} {money(c.price)}</a>; })}</div>}
      {d.rationale && <p className="small muted" style={{ marginTop: 8 }}>{d.rationale}</p>}
      {link && <a className="pill blue sm" href={link} target="_blank" rel="noopener">View on Marketplace</a>}
    </div>
  </div>;
}

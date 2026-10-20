'use client';
import { useState } from 'react';
export const prox = (u) => (u && /^https:\/\//.test(u) && !u.includes('.public.blob.vercel-storage.com') ? `/api/img?u=${encodeURIComponent(u)}` : u);
export default function Photo({ src, title, className = '', fb = null }) {
  const fbOk = !!(fb && /facebook\.com\/marketplace\/item\/\d+/.test(fb));
  const fbSrc = fbOk ? `/api/img?fb=${encodeURIComponent(fb)}` : null;
  const [cur, setCur] = useState(src ? prox(src) : fbSrc);
  const bad = !cur;
  const letter = String(title || '?').trim().charAt(0).toUpperCase() || '?';
  if (bad) return <div className={'phx ' + className} aria-label={title || ''}><span>{letter}</span></div>;
  return <img className={className} src={cur} alt={title || ''} loading="lazy" onError={() => setCur(cur !== fbSrc && fbSrc ? fbSrc : null)} />;
}

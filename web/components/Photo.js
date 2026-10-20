'use client';
import { useState } from 'react';
export const prox = (u) => (u && /^https:\/\//.test(u) && !u.includes('.public.blob.vercel-storage.com') ? `/api/img?u=${encodeURIComponent(u)}` : u);
export default function Photo({ src, title, className = '' }) {
  const [bad, setBad] = useState(!src);
  const letter = String(title || '?').trim().charAt(0).toUpperCase() || '?';
  if (bad) return <div className={'phx ' + className} aria-label={title || ''}><span>{letter}</span></div>;
  return <img className={className} src={prox(src)} alt={title || ''} loading="lazy" onError={() => setBad(true)} />;
}

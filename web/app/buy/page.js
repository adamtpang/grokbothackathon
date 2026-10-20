'use client';
import { useEffect } from 'react';
import Home from '../page';
export default function P() {
  useEffect(() => { const t = setTimeout(() => { const el = document.getElementById('buy'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150); return () => clearTimeout(t); }, []);
  return <Home />;
}

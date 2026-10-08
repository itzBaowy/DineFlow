'use client';
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) { const timer = setInterval(callback, 60000); return () => clearInterval(timer); }
export function LocalDate({ timezone }: { timezone: string }) {
  const date = useSyncExternalStore(subscribe, () => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeZone: timezone }).format(new Date()), () => '');
  return <span>{date || 'Hôm nay'}</span>;
}

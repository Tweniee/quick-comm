'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Card, Empty, ErrorBox, PageHead, StatusBadge, usePoll } from '@/components/ui';
import { api } from '@/lib/api';

function Results() {
  const q = useSearchParams().get('q') ?? '';
  const r = usePoll(() => api(`/admin/search?q=${encodeURIComponent(q)}`, { kind: 'admin' }), 60000, [q]);
  const x = r.data;
  const none = x && !x.orders.length && !x.businesses.length && !x.drivers.length;
  return (
    <>
      <PageHead title={`Results for “${q}”`} />
      <ErrorBox error={r.error} />
      {none && <Empty>Nothing matches. Try the last 4 digits of a phone or the TW- order code.</Empty>}
      <div className="grid g3">
        <Card title="Orders">{x?.orders.map((o: any) => <div key={o.id} className="row between"><Link href={`/admin/orders/${o.id}`} className="mono">{o.code}</Link><StatusBadge status={o.status} /></div>)}</Card>
        <Card title="Businesses">{x?.businesses.map((b: any) => <div key={b.id} className="row between"><Link href={`/admin/businesses/${b.id}`}>{b.name}</Link><StatusBadge status={b.status} /></div>)}</Card>
        <Card title="Riders">{x?.drivers.map((d: any) => <div key={d.id} className="row between"><Link href={`/admin/drivers/${d.id}`}>{d.name}</Link><StatusBadge status={d.availability ?? d.status} /></div>)}</Card>
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Results /></Suspense>; }

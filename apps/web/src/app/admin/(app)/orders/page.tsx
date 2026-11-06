'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { OrdersTable } from '@/components/OrdersTable';
import { Card, ErrorBox, usePoll } from '@/components/ui';
import { api } from '@/lib/api';

const FILTERS: [string, string][] = [['', 'All'], ['ASSIGNING,NO_RIDER', 'Waiting for rider'], ['ASSIGNED,PICKED_UP,OUT_FOR_DELIVERY,ARRIVED', 'With rider'], ['UNDELIVERED,RETURNING', 'Returning'], ['DELIVERED', 'Delivered'], ['RETURNED', 'Returned'], ['CANCELLED', 'Cancelled']];

function Orders() {
  const sp = useSearchParams();
  const [status, setStatus] = useState('');
  const [flagged, setFlagged] = useState(false);
  const businessId = sp.get('businessId') ?? '';
  const list = usePoll(() => api(`/admin/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(businessId ? { businessId } : {}), ...(flagged ? { flagged: 'true' } : {}), take: '100' })}`, { kind: 'admin' }), 10000, [status, flagged, businessId]);
  return (
    <>
      <h1>Orders</h1>
      <div className="tabs">
        {FILTERS.map(([v, l]) => <button key={l} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}</button>)}
        <button className={flagged ? 'on' : ''} onClick={() => setFlagged(!flagged)}>⚑ Flagged</button>
      </div>
      <ErrorBox error={list.error} />
      <Card title={`${list.data?.total ?? 0} orders`}><OrdersTable items={list.data?.items ?? []} base="/admin/orders" showBusiness /></Card>
    </>
  );
}
export default function Page() { return <Suspense><Orders /></Suspense>; }

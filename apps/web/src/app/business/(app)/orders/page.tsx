'use client';
import { useState } from 'react';
import { OrdersTable } from '@/components/OrdersTable';
import { Card, ErrorBox, usePoll } from '@/components/ui';
import { api, STATUS_LABEL } from '@/lib/api';

export default function Orders() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const q = new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { search } : {}), take: '100' });
  const list = usePoll(() => api(`/business/orders?${q}`, { kind: 'business' }), 15000, [status, search]);
  return (
    <>
      <h1>Orders</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="search" placeholder="Search order code, customer phone or name, your reference" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select style={{ width: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <ErrorBox error={list.error} />
      <Card title={`${list.data?.total ?? 0} orders`}><OrdersTable items={list.data?.items ?? []} base="/business/orders" /></Card>
    </>
  );
}

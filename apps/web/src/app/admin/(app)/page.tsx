'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, ErrorBox, Stat, StatusBadge, usePoll } from '@/components/ui';
import { api, dt, rupees } from '@/lib/api';
import { mapsLink } from '@/lib/geo';

const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export default function Dashboard() {
  const d = usePoll(() => api('/admin/dashboard', { kind: 'admin' }), 10000);
  const map = usePoll(() => api('/admin/live-map', { kind: 'admin' }), 15000);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any>(null);
  const x = d.data;
  const t = x?.today ?? {};
  return (
    <>
      <div className="row between">
        <h1>Dashboard</h1>
        <form className="row search" onSubmit={async (e) => { e.preventDefault(); setRes(await api(`/admin/search?q=${encodeURIComponent(q)}`, { kind: 'admin' })); }}>
          <input placeholder="Search phone, order code, business, rider" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          <button>Search</button>
        </form>
      </div>
      <ErrorBox error={d.error} />
      {res && (
        <Card title="Search results" right={<button className="link" onClick={() => setRes(null)}>Close</button>}>
          <div className="grid g2">
            <div><h3>Orders</h3>{res.orders.map((o: any) => <div key={o.id}><Link href={`/admin/orders/${o.id}`} className="mono">{o.code}</Link> <StatusBadge status={o.status} /> <span className="muted small">{o.business.name} · {o.customerPhone}</span></div>)}</div>
            <div><h3>Businesses</h3>{res.businesses.map((b: any) => <div key={b.id}><Link href={`/admin/businesses/${b.id}`}>{b.name}</Link> <StatusBadge status={b.status} /></div>)}
              <h3 style={{ marginTop: 8 }}>Drivers</h3>{res.drivers.map((r: any) => <div key={r.id}><Link href={`/admin/drivers/${r.id}`}>{r.name}</Link> <StatusBadge status={r.status} /> <span className="muted small">{r.availability}</span></div>)}</div>
          </div>
        </Card>
      )}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Live orders" value={x?.liveOrders ?? '—'} />
        <Stat label="Riders online / busy" value={`${x?.riders?.ONLINE ?? 0} / ${x?.riders?.BUSY ?? 0}`} />
        <Stat label="Waiting for rider" value={x?.unassigned?.length ?? 0} tone={x?.unassigned?.length ? 'warn' : undefined} />
        <Stat label="Assignment success today" value={pct(x?.metrics?.assignmentSuccessRate)} tone={x?.metrics?.assignmentSuccessRate != null && x.metrics.assignmentSuccessRate < 0.85 ? 'bad' : 'ok'} />
        <Stat label="Ready → accepted (median)" value={x?.metrics?.readyToAcceptedSeconds?.median != null ? `${Math.round(x.metrics.readyToAcceptedSeconds.median)}s` : '—'} />
        <Stat label="Ready → delivered (median)" value={x?.metrics?.readyToDeliveredMinutes?.median != null ? `${Math.round(x.metrics.readyToDeliveredMinutes.median)} min` : '—'} />
        <Stat label="Delivered rate" value={pct(x?.metrics?.deliveredRate)} />
        <Stat label="Open tickets" value={x?.openTickets ?? '—'} tone={x?.openTickets ? 'warn' : undefined} />
      </div>
      <div className="grid g2">
        <Card title="Today by status">
          <div className="row">{Object.entries(t).map(([k, v]) => <span key={k}><StatusBadge status={k} /> {String(v)}</span>)}</div>
          <p className="small"><Link href="/admin/businesses?status=PENDING">{x?.queues?.pendingBusinesses ?? 0} businesses</Link> and <Link href="/admin/drivers?status=SUBMITTED">{x?.queues?.pendingDrivers ?? 0} drivers</Link> waiting for verification. {x?.failedWebhooks ? <Link href="/admin/system">{x.failedWebhooks} failed webhooks</Link> : null}</p>
        </Card>
        <Card title="Waiting for a rider">
          {x?.unassigned?.length ? x.unassigned.map((o: any) => (
            <div key={o.id} className="row between"><span><Link href={`/admin/orders/${o.id}`} className="mono">{o.code}</Link> {o.business.name}</span><span><StatusBadge status={o.status} /> <span className="muted small">ready {dt(o.readyAt)}</span></span></div>
          )) : <p className="muted">None.</p>}
        </Card>
        <Card title="Low wallet balances">
          {x?.lowBalanceBusinesses?.length ? x.lowBalanceBusinesses.map((b: any) => <div key={b.id} className="row between"><Link href={`/admin/businesses/${b.id}`}>{b.name}</Link><span>{rupees(Number(b.available))}</span></div>) : <p className="muted">None.</p>}
        </Card>
        <Card title="Riders online">
          {map.data?.riders?.length ? map.data.riders.map((r: any) => (
            <div key={r.id} className="row between"><Link href={`/admin/drivers/${r.id}`}>{r.name}</Link><span className="small">{r.availability} · {r.lastLat ? <a href={mapsLink(r.lastLat, r.lastLng)} target="_blank" rel="noreferrer">location {dt(r.lastLocationAt)}</a> : 'no GPS'}</span></div>
          )) : <p className="muted">No riders online.</p>}
        </Card>
      </div>
    </>
  );
}

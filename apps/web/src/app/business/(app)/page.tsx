'use client';
import Link from 'next/link';
import { OrdersTable } from '@/components/OrdersTable';
import { Card, ErrorBox, Stat, usePoll } from '@/components/ui';
import { api, rupees } from '@/lib/api';

export default function BusinessHome() {
  const me = usePoll(() => api('/business/me', { kind: 'business' }), 60000);
  const wallet = usePoll(() => api('/business/wallet', { kind: 'business' }), 20000);
  const today = usePoll(() => api('/business/orders/today', { kind: 'business' }), 15000);
  const live = usePoll(() => api('/business/orders?status=CREATED,READY,ASSIGNING,NO_RIDER,ASSIGNED,PICKED_UP,OUT_FOR_DELIVERY,ARRIVED,RETURNING&take=50', { kind: 'business' }), 10000);
  const t = today.data ?? {};
  const b = me.data;

  return (
    <>
      <div className="row between"><h1>Today</h1><Link className="btn" href="/business/orders/new">+ New order</Link></div>
      <ErrorBox error={me.error || wallet.error} />
      {b && b.status !== 'APPROVED' && (
        <div className="alert warn">
          <span>
            {b.status === 'PENDING' && 'Your business is pending verification. Upload your documents in Settings; orders and recharge open after approval.'}
            {b.status === 'REJECTED' && `Verification was not approved: ${b.statusReason}. Upload corrected documents in Settings to re-apply.`}
            {b.status === 'SUSPENDED' && `Your account is suspended: ${b.statusReason}. New orders are blocked; live orders continue.`}
          </span>
          <Link className="btn secondary" href="/business/settings">Open Settings</Link>
        </div>
      )}
      {wallet.data?.lowBalance && b?.status === 'APPROVED' && (
        <div className="alert warn"><span>Low wallet balance: {rupees(wallet.data.available)} available.</span><Link className="btn secondary" href="/business/wallet">Recharge</Link></div>
      )}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Wallet available" value={rupees(wallet.data?.available)} tone={wallet.data?.lowBalance ? 'warn' : undefined} />
        <Stat label="Ready / looking for rider" value={(t.READY ?? 0) + (t.ASSIGNING ?? 0)} />
        <Stat label="No rider" value={t.NO_RIDER ?? 0} tone={t.NO_RIDER ? 'warn' : undefined} />
        <Stat label="With rider" value={(t.ASSIGNED ?? 0) + (t.PICKED_UP ?? 0) + (t.OUT_FOR_DELIVERY ?? 0) + (t.ARRIVED ?? 0)} />
        <Stat label="Delivered" value={t.DELIVERED ?? 0} tone="ok" />
        <Stat label="Returned / returning" value={(t.RETURNED ?? 0) + (t.RETURNING ?? 0)} tone={t.RETURNED ? 'bad' : undefined} />
      </div>
      <Card title="Live orders" right={<span className="muted small">{live.lastUpdated ? `Last updated ${live.lastUpdated.toLocaleTimeString()}` : ''}</span>}>
        <OrdersTable items={live.data?.items ?? []} base="/business/orders" />
      </Card>
      <p className="muted small">We never promise a delivery time. Inside the city deliveries usually take 30 to 70 minutes from Ready, depending on distance and traffic.</p>
    </>
  );
}

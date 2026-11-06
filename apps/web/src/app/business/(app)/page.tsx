'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ErrorBox, Empty, greeting, StatusBadge, usePoll } from '@/components/ui';
import { api, rupees } from '@/lib/api';

const HINT: Record<string, string> = { CREATED: 'Pack it, then mark Ready', READY: 'Looking for a rider', ASSIGNING: 'Looking for a rider', NO_RIDER: 'No rider yet · retry', ARRIVED: 'Rider at the door' };
const TILES: { label: string; statuses: string[]; cls: string }[] = [
  { label: 'Ready', statuses: ['READY', 'ASSIGNING', 'NO_RIDER'], cls: 's-READY' },
  { label: 'Assigned', statuses: ['ASSIGNED'], cls: 's-ASSIGNED' },
  { label: 'Picked', statuses: ['PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED'], cls: 's-PICKED_UP' },
  { label: 'Delivered', statuses: ['DELIVERED'], cls: 's-DELIVERED' },
  { label: 'Returned', statuses: ['UNDELIVERED', 'RETURNING', 'RETURNED'], cls: 's-RETURNED' },
];

/** B05 · Under review. */
function UnderReview({ b }: { b: any }) {
  const steps: [string, boolean][] = [
    ['Account and contact verified', !!(b.phoneVerifiedAt && b.emailVerifiedAt)],
    [b.gstin ? 'GSTIN saved for the express check' : 'Documents uploaded', true],
    [`Staff check: shop, address${b.instagram ? ', Instagram' : b.website ? ', website' : ''}`, false],
    ['Wallet unlocks after approval', false],
  ];
  return (
    <>
      <div className="hero"><h1 style={{ margin: 0 }}>We&apos;re verifying {b.name}</h1><p className="muted" style={{ margin: 0 }}>Express checks usually clear in minutes. Manual checks take 1–2 business days. We&apos;ll SMS and email you.</p></div>
      <ul className="timeline card">{steps.map(([s, done]) => <li key={s} className={done ? '' : 'todo'}><span>{done ? <b>{s}</b> : s}</span><span /></li>)}</ul>
      <div className="card"><b>Until you&apos;re approved</b>
        <div className="row between" style={{ marginTop: 8 }}><span>Create order</span><span className="badge">Locked</span></div>
        <div className="row between" style={{ marginTop: 8 }}><span>Recharge wallet</span><span className="badge">Locked</span></div>
      </div>
      <p className="note">If rejected, you&apos;ll see the reason and can re-apply once with corrected documents.</p>
      <Link className="btn secondary" href="/business/support">Contact support</Link>
    </>
  );
}

/** B06 · Home. */
export default function BusinessHome() {
  const router = useRouter();
  const me = usePoll(() => api('/business/me', { kind: 'business' }), 60000);
  const wallet = usePoll(() => api('/business/wallet', { kind: 'business' }), 20000);
  const today = usePoll(() => api('/business/orders/today', { kind: 'business' }), 15000);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const list = usePoll(() => api(`/business/orders?from=${start.toISOString()}&take=50`, { kind: 'business' }), 10000);
  const b = me.data;
  useEffect(() => { if (b && b.status === 'PENDING' && !b.submittedAt) router.replace('/business/signup'); }, [b, router]);
  if (!b) return <ErrorBox error={me.error} />;
  if (b.status === 'PENDING') return <UnderReview b={b} />;
  const t = today.data ?? {};
  const w = wallet.data;
  const items = list.data?.items ?? [];
  return (
    <>
      <div className="row between">
        <div><p className="muted" style={{ margin: 0 }}>{greeting()}</p><h1 style={{ margin: 0 }}>{b.name}</h1></div>
        <Link href="/business/wallet" className="wallet-pill"><span>Wallet</span>{rupees(w?.available)}</Link>
      </div>
      <ErrorBox error={wallet.error} />
      {b.status === 'REJECTED' && <div className="alert error"><span>Verification was not approved: {b.statusReason}</span><Link className="btn secondary" href="/business/support">Contact support</Link></div>}
      {b.status === 'SUSPENDED' && <div className="alert error"><span>Your account is paused: {b.statusReason}. New orders are blocked; live orders continue.</span></div>}
      {w?.lowBalance && b.status === 'APPROVED' && <div className="alert warn"><span>Low balance. New orders need {rupees(w.requiredToCreate)} available.</span><Link className="btn secondary" href="/business/wallet/recharge">Recharge</Link></div>}
      {b.status === 'APPROVED' && <Link className="btn big" href="/business/orders/new">New delivery · {rupees(w?.deliveryFee)}</Link>}
      <div className="tiles">
        {TILES.map((x) => <div key={x.label} className={`tile ${x.cls}`}><b>{x.statuses.reduce((s, k) => s + (t[k] ?? 0), 0)}</b><span>{x.label}</span></div>)}
      </div>
      <div className="row between"><h3 style={{ margin: 0 }}>Today&apos;s orders</h3><Link href="/business/orders" className="small">{items.length} total · all orders</Link></div>
      <div className="list">
        {items.map((o: any) => (
          <Link key={o.id} href={`/business/orders/${o.id}`} className="item">
            <span className="row between"><b>{o.customer.name} · {o.parcel.description}</b><StatusBadge status={o.status} /></span>
            <span className="small muted">{o.code} · {o.rider ? `Rider ${o.rider.firstName}` : HINT[o.status] ?? o.statusLabel}{o.customer.landmark ? ` · ${o.customer.landmark}` : ''}</span>
          </Link>
        ))}
        {list.data && !items.length && <Empty>No orders yet today.</Empty>}
      </div>
      <p className="note">We never promise a delivery time. Inside the city deliveries usually take 30 to 70 minutes from Ready.</p>
    </>
  );
}

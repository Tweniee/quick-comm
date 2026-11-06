'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, rupees, tm } from '@/lib/api';
import { mapsLink } from '@/lib/geo';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const minsBetween = (a?: string | null, b?: string | null) => (a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000) : null);
const OFFER: Record<string, string> = { DECLINED: 'Declined', EXPIRED: 'No answer', ACCEPTED: 'Accepted', PENDING: 'Deciding', CANCELLED: 'Withdrawn' };

/** B09–B14 · One order page that changes with the status. */
export default function OrderDetail({ params }: { params: { id: string } }) {
  const o = usePoll(() => api(`/business/orders/${params.id}`, { kind: 'business' }), 5000, [params.id]);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const [wallet, setWallet] = useState<any>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const d = o.data;
  useEffect(() => { if (d?.status === 'DELIVERED') api('/business/wallet', { kind: 'business' }).then(setWallet).catch(() => {}); }, [d?.status]);
  const act = async (path: string, body?: unknown, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setError(null); setMsg('');
    try { await api(`/business/orders/${params.id}/${path}`, { kind: 'business', body: body ?? {} }); await o.reload(); } catch (e) { setError(e); }
  };
  if (!d) return <ErrorBox error={o.error} />;
  const head = (
    <div className="row between">
      <div><Link href="/business/orders" className="small">← Orders</Link><h1 style={{ margin: 0 }}><span className="mono">{d.code}</span></h1></div>
      <StatusBadge status={d.status} />
    </div>
  );
  const share = <button className="secondary" onClick={() => { navigator.clipboard?.writeText(d.trackingUrl); setMsg('Tracking link copied'); }}>Share tracking link</button>;
  const errors = <><ErrorBox error={error || o.error} actions={{ RECHARGE: <Link className="btn secondary" href="/business/wallet/recharge">Recharge</Link> }} />{msg && <div className="alert ok"><span>{msg}</span></div>}</>;
  const total = d.fees.delivery + d.fees.return;

  // B09 · Created: label it, then Ready.
  if (d.status === 'CREATED') return (
    <>
      {head}{errors}
      <div><h2 style={{ margin: 0 }}>Pack it, seal it, then mark Ready</h2><p className="muted" style={{ margin: '4px 0 0' }}>We look for a rider only after Ready, so nobody waits at your counter.</p></div>
      <div className="parcel-label">
        <span className="tiny muted" style={{ letterSpacing: '.08em' }}>WRITE ON THE PARCEL</span>
        <span className="code">{d.code}</span>
        <b>{d.customer.name} · {d.customer.phone}</b>
      </div>
      <dl className="kv card">
        <dt>Parcel</dt><dd>{d.parcel.description} · {(d.parcel.weightGrams / 1000).toFixed(1)} kg · {rupees(d.parcel.declaredValue)}{d.parcel.isFragile ? ' · Fragile' : ''}</dd>
        <dt>Drop</dt><dd>{d.customer.address}{d.customer.landmark ? `, ${d.customer.landmark}` : ''}</dd>
        <dt>Customer OTP</dt><dd>Sent at assignment</dd>
        <dt>Fee</dt><dd>{rupees(d.fees.delivery)} · {rupees(total)} held when a rider accepts, {rupees(d.fees.return)} back on delivery</dd>
      </dl>
      <button className="big" onClick={() => act('ready')}>Mark Ready · find a rider</button>
      <div className="row"><button className="danger" style={{ flex: 1 }} onClick={() => act('cancel', {}, 'Cancel this order? No charge.')}>Cancel · ₹0</button></div>
    </>
  );

  // B10 · Assigning.
  if (d.status === 'READY' || d.status === 'ASSIGNING') {
    const a = d.assignment;
    const used = a?.startedAt ? Math.min(a.maxSeconds, (now - new Date(a.startedAt).getTime()) / 1000) : 0;
    return (
      <>
        {head}{errors}
        <div><h2 style={{ margin: 0 }}>Offering to the nearest rider</h2><p className="muted" style={{ margin: '4px 0 0' }}>Each rider gets {a?.offerSeconds ?? 30} seconds to accept. We try up to {a?.maxRiders ?? 5} riders or {mmss(a?.maxSeconds ?? 180)} minutes.</p></div>
        <div className="card stack tight">
          {(a?.offers ?? []).map((f: any) => (
            <div key={f.n} className="row between"><span>Rider {f.n} · {f.distanceKm.toFixed(1)} km</span>
              <span className={f.status === 'PENDING' ? 'teal-t strong' : 'muted'}>{OFFER[f.status] ?? f.status}{f.status === 'PENDING' ? ` · ${Math.max(0, Math.round((new Date(f.expiresAt).getTime() - now) / 1000))} s` : ''}</span></div>
          ))}
          {!a?.offers?.length && <span className="muted">Finding riders near your shop…</span>}
          <div className="progress"><i style={{ width: `${(used / (a?.maxSeconds ?? 180)) * 100}%` }} /></div>
          <span className="small muted">Time used {mmss(used)} of {mmss(a?.maxSeconds ?? 180)}</span>
        </div>
        <p className="note">Nothing is charged until a rider accepts.</p>
        <button className="danger" onClick={() => act('cancel', {}, 'Cancel this order? No charge.')}>Cancel order · ₹0</button>
      </>
    );
  }

  // B13 · No rider.
  if (d.status === 'NO_RIDER') return (
    <>
      {head}{errors}
      <div className="alert warn" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><b>No rider available at this moment in your area</b><span>{d.assignment?.offers?.length ?? 0} riders were offered this order. None could take it. Please retry in 10 minutes.</span></div>
      <dl className="kv card"><dt>Order status</dt><dd>Still Ready</dd><dt>Charged</dt><dd>₹0</dd><dt>Retries left today</dt><dd>{d.assignment?.retriesLeft ?? '—'}</dd></dl>
      <p className="note">Ready orders with no rider by end of day are cancelled automatically, with no charge.</p>
      <button className="big" disabled={d.assignment?.retriesLeft === 0} onClick={() => act('retry-assignment')}>Retry assignment</button>
      <button className="danger" onClick={() => act('cancel', {}, 'Cancel this order? No charge.')}>Cancel · ₹0</button>
    </>
  );

  // B12 · Delivered.
  if (d.status === 'DELIVERED') return (
    <>
      {head}{errors}
      <div className="hero" style={{ background: 'var(--ok-bg)', color: 'var(--ink)' }}><h2 style={{ margin: 0, color: 'var(--ok)' }}>✓ Delivered to {d.customer.name.split(' ')[0]}</h2><span>OTP confirmed at the door · {tm(d.times.deliveredAt)}</span></div>
      <dl className="kv card">
        <dt>Delivery fee</dt><dd>{rupees(d.fees.delivery)} deducted</dd>
        <dt>Wallet now</dt><dd>{rupees(wallet?.available)}</dd>
        <dt>Rider</dt><dd>{d.rider?.firstName ?? '—'}</dd>
        <dt>Proof</dt><dd>OTP · GPS at drop · time</dd>
        <dt>Ready → Delivered</dt><dd>{minsBetween(d.times.readyAt, d.times.deliveredAt) ?? '—'} min</dd>
      </dl>
      <div className="row"><Link className="btn" style={{ flex: 1 }} href="/business/orders/new">New delivery</Link><Link className="btn secondary" style={{ flex: 1 }} href="/business/wallet">View passbook</Link></div>
    </>
  );

  // B14 · Undelivered and return.
  if (['UNDELIVERED', 'RETURNING', 'RETURNED'].includes(d.status)) {
    const arrived = d.timeline?.find((t: any) => t.status === 'ARRIVED');
    const wait = minsBetween(d.times.arrivedAt, d.times.undeliveredAt);
    return (
      <>
        {head}{errors}
        <div><h2 style={{ margin: 0 }}>{d.undeliveredReason ?? 'Not delivered'}. {d.status === 'RETURNED' ? 'The parcel is back with you.' : `${d.rider?.firstName ?? 'The rider'} is bringing it back.`}</h2><p className="muted" style={{ margin: '4px 0 0' }}>Every attempt is logged so you can check it.</p></div>
        <dl className="kv card">
          <dt>Arrived at drop</dt><dd>{tm(d.times.arrivedAt)}{arrived?.lat != null ? ' · GPS matched' : ''}</dd>
          <dt>Waited</dt><dd>{wait != null ? `${wait} min` : '—'}</dd>
          <dt>Reason</dt><dd>{d.undeliveredReason ?? '—'}</dd>
        </dl>
        <div className="card">
          <div className="row between"><span>Forward</span><span>{rupees(d.fees.delivery)}</span></div>
          <div className="row between"><span>Return</span><span>{rupees(d.fees.return)}</span></div>
          <div className="row between strong" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6 }}><span>Total</span><span>{rupees(total)}</span></div>
        </div>
        {d.status === 'RETURNING' && (
          <div className="card soft stack tight">
            <b>When {d.rider?.firstName ?? 'the rider'} reaches your shop</b>
            <span className="small">Check the seal and label, then confirm. This closes the order as Returned.{d.returnOtp ? ' Give the rider this return code:' : ''}</span>
            {d.returnOtp && <span className="otp-big" style={{ fontSize: 32 }}>{d.returnOtp}</span>}
            <button className="big" onClick={() => act('confirm-return', {}, 'Is the parcel back with you, seal intact?')}>Confirm parcel received</button>
          </div>
        )}
        <Link className="btn secondary" href={`/business/support?order=${d.code}&type=WALLET_DISPUTE`}>Question this charge</Link>
      </>
    );
  }

  // Cancelled.
  if (d.status === 'CANCELLED') return (<>{head}{errors}<div className="alert info"><span>Cancelled{d.cancelReason ? `: ${d.cancelReason}` : ''}. Any hold was released.</span></div><Link className="btn" href="/business/orders/new">New delivery</Link></>);

  // B11 · With a rider: Assigned → Arrived.
  const steps: [string, string | null, string?][] = [
    ['Ready', d.times.readyAt],
    [`Assigned · ${rupees(total)} held`, d.times.assignedAt],
    ['Picked Up · seal checked', d.times.pickedUpAt],
    [d.status === 'ARRIVED' ? 'Arrived at the door' : 'Out for Delivery', d.status === 'OUT_FOR_DELIVERY' || d.status === 'ARRIVED' ? (d.times.arrivedAt ?? 'now') : null],
  ];
  const wait = d.waitEndsAt ? Math.max(0, (new Date(d.waitEndsAt).getTime() - now) / 1000) : null;
  return (
    <>
      {head}{errors}
      <h2 style={{ margin: 0 }}>{d.status === 'ASSIGNED' ? `${d.rider?.firstName ?? 'Rider'} is coming to pick up` : d.status === 'ARRIVED' ? `${d.rider?.firstName} is at the door${wait != null ? ` · waiting ${mmss(wait)} more` : ''}` : d.status === 'PICKED_UP' ? 'Parcel picked up' : 'On the way to the customer'}</h2>
      {d.rider && (
        <div className="card row between">
          <span className="row"><span className="avatar">{d.rider.firstName.slice(0, 2).toUpperCase()}</span><span><b>{d.rider.firstName}</b><div className="small muted">Bike {d.rider.vehicleNumber ?? ''} · {d.rider.phoneMasked}</div></span></span>
          {d.rider.location && <a className="btn secondary" href={mapsLink(d.rider.location.lat, d.rider.location.lng)} target="_blank" rel="noreferrer">Map</a>}
        </div>
      )}
      <ul className="timeline card">
        {steps.map(([label, at]) => <li key={label} className={at ? '' : 'todo'}><span>{at ? <b>{label}</b> : label}</span><span className="small muted">{at === 'now' ? 'now' : at ? tm(at) : ''}</span></li>)}
      </ul>
      <dl className="kv card"><dt>Customer OTP</dt><dd>{d.otp.status === 'SENT' ? 'Sent by SMS + WhatsApp' : 'Not sent yet'}{d.otp.locked ? ' · locked, support is verifying' : ''}</dd><dt>Customer</dt><dd>{d.customer.name} · {d.customer.phone}</dd></dl>
      <div className="row">
        {share}
        <a className="btn secondary" href={`https://wa.me/91${d.customer.phone}?text=${encodeURIComponent(`Track your parcel: ${d.trackingUrl}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        {d.status === 'ASSIGNED' && <button className="danger" onClick={() => { const n = prompt('Why cancel? Support will check with the rider.'); if (n !== null) act('request-cancellation', { note: n }).then(() => setMsg('Cancellation requested. Support will confirm.')); }}>Request cancellation</button>}
      </div>
    </>
  );
}

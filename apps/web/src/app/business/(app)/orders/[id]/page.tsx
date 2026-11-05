'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, dt, rupees } from '@/lib/api';
import { mapsLink } from '@/lib/geo';

export default function OrderDetail({ params }: { params: { id: string } }) {
  const o = usePoll(() => api(`/business/orders/${params.id}`, { kind: 'business' }), 8000, [params.id]);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const act = async (path: string, body?: unknown, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    try { await api(`/business/orders/${params.id}/${path}`, { kind: 'business', body: body ?? {} }); await o.reload(); setMsg('Done'); } catch (e) { setError(e); }
  };
  const d = o.data;
  if (!d) return <ErrorBox error={o.error} />;

  return (
    <>
      <div className="row between">
        <h1><span className="mono">{d.code}</span> <StatusBadge status={d.status} /></h1>
        <span className="muted small">Last updated {o.lastUpdated?.toLocaleTimeString()}</span>
      </div>
      <ErrorBox error={error || o.error} actions={{ RECHARGE: <Link className="btn secondary" href="/business/wallet">Recharge</Link> }} />
      {msg && !error && <div className="alert ok"><span>{msg}</span></div>}

      {d.status === 'NO_RIDER' && (
        <div className="alert warn">
          <span>No rider available at this moment in your area. Please retry in 10 minutes. You have not been charged.</span>
          <div className="row"><button onClick={() => act('retry-assignment')}>Retry</button><button className="secondary" onClick={() => act('cancel', {}, 'Cancel this order? No charge.')}>Cancel</button></div>
        </div>
      )}
      {d.status === 'RETURNING' && d.returnOtp && (
        <div className="alert warn">
          <span>The parcel is coming back ({d.undeliveredReason}). Give this return code to the rider when you receive it: <b className="mono" style={{ fontSize: 20 }}>{d.returnOtp}</b></span>
          <button className="secondary" onClick={() => act('confirm-return', {}, 'Confirm the parcel is back with you?')}>I received it</button>
        </div>
      )}

      <div className="grid g2">
        <Card title="Actions">
          <div className="row">
            {d.status === 'CREATED' && <button onClick={() => act('ready')}>Mark Ready (packed & sealed)</button>}
            {['CREATED', 'READY', 'ASSIGNING', 'NO_RIDER'].includes(d.status) && <button className="secondary" onClick={() => act('cancel', {}, 'Cancel this order? No charge.')}>Cancel order</button>}
            {d.status === 'ASSIGNED' && <button className="secondary" onClick={() => act('request-cancellation', { note: prompt('Why cancel?') || '' })}>Request cancellation</button>}
            <button className="secondary" onClick={() => { navigator.clipboard?.writeText(d.trackingUrl); setMsg('Tracking link copied'); }}>Copy tracking link</button>
            <a className="btn secondary" href={`https://wa.me/91${d.customer.phone}?text=${encodeURIComponent(`Track your parcel: ${d.trackingUrl}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
          </div>
          <dl className="kv" style={{ marginTop: 16 }}>
            <dt>Delivery OTP</dt><dd>{d.otp.status === 'SENT' ? 'Sent to customer' : 'Not sent yet'}{d.otp.locked && ' · locked, support is verifying'}</dd>
            <dt>Fees</dt><dd>{rupees(d.fees.delivery)} delivery{['UNDELIVERED', 'RETURNING', 'RETURNED'].includes(d.status) && ` + ${rupees(d.fees.return)} return = ${rupees(d.fees.delivery + d.fees.return)}`}</dd>
            {d.cancelReason && <><dt>Cancel reason</dt><dd>{d.cancelReason}</dd></>}
            {d.waitEndsAt && <><dt>Rider waiting until</dt><dd>{dt(d.waitEndsAt)}</dd></>}
          </dl>
        </Card>
        <Card title="Rider">
          {d.rider ? (
            <dl className="kv">
              <dt>Name</dt><dd>{d.rider.firstName}</dd>
              <dt>Phone</dt><dd>{d.rider.phoneMasked}</dd>
              <dt>Vehicle</dt><dd>{d.rider.vehicleNumber ?? '—'}</dd>
              <dt>Live location</dt><dd>{d.rider.location ? <a href={mapsLink(d.rider.location.lat, d.rider.location.lng)} target="_blank" rel="noreferrer">Open map</a> : '—'}</dd>
            </dl>
          ) : <p className="muted">{['READY', 'ASSIGNING'].includes(d.status) ? 'Looking for the nearest rider…' : 'No rider assigned.'}</p>}
        </Card>
        <Card title="Customer & parcel">
          <dl className="kv">
            <dt>Customer</dt><dd>{d.customer.name} · {d.customer.phone}</dd>
            <dt>Address</dt><dd>{d.customer.address}{d.customer.landmark && `, ${d.customer.landmark}`} {d.customer.pincode} · <a href={mapsLink(d.customer.lat, d.customer.lng)} target="_blank" rel="noreferrer">pin</a></dd>
            <dt>Pickup</dt><dd>{d.pickup.label}: {d.pickup.address}</dd>
            <dt>Parcel</dt><dd>{d.parcel.description} · {(d.parcel.weightGrams / 1000).toFixed(1)} kg · value {rupees(d.parcel.declaredValue)}{d.parcel.isFragile && ' · Fragile'}</dd>
            {d.businessReferenceId && <><dt>Your reference</dt><dd>{d.businessReferenceId}</dd></>}
          </dl>
        </Card>
        <Card title="Timeline">
          <ul className="timeline">
            {d.timeline?.map((t: any, i: number) => (
              <li key={i}><b>{t.label}</b> <span className="muted small">{dt(t.at)} · {t.actorType.toLowerCase()}</span>{t.reason && <div className="small">{t.reason}</div>}</li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

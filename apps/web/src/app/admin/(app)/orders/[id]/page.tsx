'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, dt, rupees } from '@/lib/api';
import { mapsLink } from '@/lib/geo';

/** Support's one screen: timeline, wallet, GPS, calls, OTP attempts, offers, notifications together. */
export default function AdminOrder({ params }: { params: { id: string } }) {
  const r = usePoll(() => api(`/admin/orders/${params.id}`, { kind: 'admin' }), 10000, [params.id]);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const act = async (path: string, body: unknown = {}, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setError(null); setOk('');
    try { await api(`/admin/orders/${params.id}/${path}`, { kind: 'admin', body }); setOk('Done'); await r.reload(); } catch (e) { setError(e); }
  };
  const x = r.data;
  if (!x) return <ErrorBox error={r.error} />;
  const o = x.order;
  return (
    <>
      <h1><span className="mono">{o.code}</span> <StatusBadge status={o.status} /> {o.isTest && <span className="badge">TEST</span>}</h1>
      <p className="muted"><Link href={`/admin/businesses/${x.business.id}`}>{x.business.name}</Link> · {x.business.phone} · source {o.source}{o.businessReferenceId && ` · ref ${o.businessReferenceId}`}</p>
      <ErrorBox error={error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      {o.flags?.length > 0 && <div className="alert warn"><span>Flags: {o.flags.join(', ')}</span></div>}
      <div className="row" style={{ marginBottom: 16 }}>
        {['CREATED', 'READY', 'ASSIGNING', 'NO_RIDER', 'ASSIGNED'].includes(o.status) && <button className="danger" onClick={() => act('cancel', { reason: 'SUPPORT_CANCELLED', note: prompt('Note') ?? '' }, 'Cancel this order? Any hold is released.')}>Cancel</button>}
        {o.status === 'ASSIGNED' && <button className="secondary" onClick={() => act('reassign', { reason: prompt('Reason for reassigning') ?? '' })}>Reassign rider</button>}
        {o.status === 'NO_RIDER' && <button onClick={() => act('retry-assignment')}>Retry assignment</button>}
        {['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED'].includes(o.status) && <button className="secondary" onClick={() => act('resend-otp')}>Resend OTP to customer</button>}
        {o.otp.locked && <button onClick={() => act('unlock-otp', {}, 'Have you verified the customer by phone? This unlocks OTP entry and resends it.')}>Unlock OTP</button>}
        {o.status === 'CANCELLED' && !o.times?.pickedUpAt && <button className="secondary" onClick={() => act('rider-goodwill', { reason: prompt('Why? e.g. rider had already left for pickup') ?? '' }, 'Credit ₹10 goodwill to the rider who accepted this order? Only once per order.')}>Rider goodwill ₹10</button>}
        {o.status === 'RETURNING' && <button className="secondary" onClick={() => act('force-return-complete', {}, 'Mark returned to business? Use only with confirmation from the business.')}>Mark returned</button>}
      </div>

      <div className="grid g2">
        <Card title="Why this charge (evidence)">
          <dl className="kv">
            <dt>Wait at drop</dt><dd>{x.evidence.waitMinutes != null ? `${x.evidence.waitMinutes.toFixed(1)} min` : '—'}</dd>
            <dt>Customer calls</dt><dd>{x.evidence.customerCalls}</dd>
            <dt>OTP</dt><dd>{o.otp.status} · {x.evidence.otpFailedAttempts} wrong attempts{o.otp.locked && ' · LOCKED'}</dd>
            <dt>GPS at arrival</dt><dd>{x.evidence.gpsAtArrival ? 'Yes' : 'No'}</dd>
            <dt>Undelivered reason</dt><dd>{o.undeliveredReason ?? '—'}</dd>
          </dl>
          <h3 style={{ marginTop: 12 }}>Wallet entries</h3>
          {x.ledger.length ? x.ledger.map((l: any) => <div key={l.id} className="small">{dt(l.createdAt)} · <b>{l.type}</b> {rupees(l.amount)} · {l.reason}</div>) : <p className="muted small">No money moved.</p>}
          <h3 style={{ marginTop: 12 }}>Rider earnings</h3>
          {x.earnings.length ? x.earnings.map((e: any) => <div key={e.id} className="small">{e.leg}: rider {rupees(e.amount)}, platform {rupees(e.platform)}</div>) : <p className="muted small">None yet.</p>}
        </Card>
        <Card title="Timeline">
          <ul className="timeline">
            {o.timeline.map((t: any, i: number) => (
              <li key={i}><b>{t.label}</b> <span className="muted small">{dt(t.at)} · {t.actorType}</span>
                {t.lat != null && <> · <a className="small" href={mapsLink(t.lat, t.lng)} target="_blank" rel="noreferrer">GPS</a></>}
                {t.reason && <div className="small">{t.reason}</div>}{t.note && <div className="small muted">{t.note}</div>}</li>
            ))}
          </ul>
        </Card>
        <Card title="People & places">
          <dl className="kv">
            <dt>Customer</dt><dd>{o.customer.name} · <a href={`tel:${o.customer.phone}`}>{o.customer.phone}</a></dd>
            <dt>Drop</dt><dd>{o.customer.address} {o.customer.landmark} · <a href={mapsLink(o.customer.lat, o.customer.lng)} target="_blank" rel="noreferrer">pin</a></dd>
            <dt>Pickup</dt><dd>{o.pickup.address} · <a href={mapsLink(o.pickup.lat, o.pickup.lng)} target="_blank" rel="noreferrer">pin</a></dd>
            <dt>Rider</dt><dd>{x.driver ? <><Link href={`/admin/drivers/${x.driver.id}`}>{x.driver.name}</Link> · <a href={`tel:${x.driver.phone}`}>{x.driver.phone}</a> · {x.driver.vehicleNumber}</> : '—'}</dd>
            <dt>Rider location</dt><dd>{o.rider?.location ? <a href={mapsLink(o.rider.location.lat, o.rider.location.lng)} target="_blank" rel="noreferrer">{dt(o.rider.location.at)}</a> : '—'}</dd>
            <dt>Parcel</dt><dd>{o.parcel.description} · {(o.parcel.weightGrams / 1000).toFixed(1)} kg · {rupees(o.parcel.declaredValue)}{o.parcel.isFragile && ' · Fragile'}</dd>
            <dt>Tracking</dt><dd><a href={o.trackingUrl} target="_blank" rel="noreferrer">link</a></dd>
          </dl>
        </Card>
        <Card title="Calls, OTP events, offers">
          <h3>Calls</h3>{x.calls.map((c: any) => <div key={c.id} className="small">{dt(c.calledAt)} · {c.target} · {c.outcome ?? '—'}</div>)}
          <h3 style={{ marginTop: 8 }}>OTP</h3>{x.otpEvents.map((e: any) => <div key={e.id} className="small">{dt(e.createdAt)} · {e.kind} · {e.actorType}</div>)}
          <h3 style={{ marginTop: 8 }}>Assignment offers</h3>{x.offers.map((f: any) => <div key={f.id} className="small">round {f.round} · {f.driver.name} · {f.distanceKm} km · {f.status}</div>)}
          <h3 style={{ marginTop: 8 }}>Notifications</h3>{x.notifications.map((n: any) => <div key={n.id} className="small">{dt(n.createdAt)} · {n.channel} → {n.to} · {n.template} · {n.status}</div>)}
          {x.tickets.length > 0 && <><h3 style={{ marginTop: 8 }}>Tickets</h3>{x.tickets.map((t: any) => <div key={t.id} className="small"><Link href={`/admin/tickets?open=${t.id}`}>{t.subject}</Link> · {t.status}</div>)}</>}
        </Card>
      </div>
    </>
  );
}

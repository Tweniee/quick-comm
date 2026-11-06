'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, LEDGER_LABEL, ledgerAmount, ledgerSign, rupees, tm } from '@/lib/api';
import { mapsLink } from '@/lib/geo';


/** A03 · Order detail: one screen with timeline, evidence, wallet, GPS, calls and OTP attempts. */
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
  const ev = x.evidence;
  const total = x.ledger.reduce((s: number, l: any) => s - ledgerSign(l.type) * Math.abs(l.amount), 0);
  const riderTotal = x.earnings.reduce((s: number, e: any) => s + e.amount, 0);
  const platformTotal = x.earnings.reduce((s: number, e: any) => s + e.platform, 0);
  const prompted = (label: string) => { const v = prompt(label); return v === null ? null : v; };
  return (
    <>
      <Link href="/admin/orders" className="small">← Orders</Link>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1><span className="mono">{o.code}</span> <StatusBadge status={o.status} /> {o.isTest && <span className="badge">TEST</span>}</h1>
          <p className="sub" style={{ margin: 0 }}>
            <Link href={`/admin/businesses/${x.business.id}`}>{x.business.name}</Link> → {o.dropArea ?? o.customer.address?.split(',').slice(-2).join(',').trim()}
            {x.driver && <> · Rider <Link href={`/admin/drivers/${x.driver.id}`}>{x.driver.name}</Link></>}
            {' '}· {o.parcel.description} · {(o.parcel.weightGrams / 1000).toFixed(1)} kg · {rupees(o.parcel.declaredValue)}
          </p>
        </div>
        <div className="row">
          {x.driver && <a className="btn secondary" href={`tel:${x.driver.phone}`}>Call rider</a>}
          {o.status === 'ASSIGNED' && <button className="secondary" onClick={() => { const v = prompted('Reason for reassigning'); if (v !== null) act('reassign', { reason: v }); }}>Reassign</button>}
          {o.status === 'NO_RIDER' && <button onClick={() => act('retry-assignment')}>Retry assignment</button>}
          <Link className="btn secondary" href={`/admin/businesses/${x.business.id}?order=${o.id}#wallet`}>Credit wallet</Link>
          {['CREATED', 'READY', 'ASSIGNING', 'NO_RIDER', 'ASSIGNED'].includes(o.status) && <button className="danger" onClick={() => { const v = prompted('Note for the business'); if (v !== null) act('cancel', { reason: 'SUPPORT_CANCELLED', note: v }, 'Cancel this order? Any hold is released.'); }}>Cancel</button>}
        </div>
      </div>
      <ErrorBox error={error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      {o.flags?.length > 0 && <div className="alert warn"><span>Flags: {o.flags.join(', ')}</span></div>}
      <div className="row">
        {['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED'].includes(o.status) && <button className="secondary" onClick={() => act('resend-otp')}>Resend OTP to customer</button>}
        {o.otp.locked && <button onClick={() => act('unlock-otp', {}, 'Have you verified the customer by phone? This unlocks OTP entry and resends it.')}>Unlock OTP</button>}
        {o.status === 'CANCELLED' && !o.times?.pickedUpAt && <button className="secondary" onClick={() => { const v = prompted('Why? e.g. rider had already left for pickup'); if (v) act('rider-goodwill', { reason: v }, 'Credit ₹10 goodwill to the rider who accepted this order? Only once per order.'); }}>Rider goodwill ₹10</button>}
        {o.status === 'RETURNING' && <button className="secondary" onClick={() => act('force-return-complete', {}, 'Mark returned to business? Use only with confirmation from the business.')}>Mark returned</button>}
      </div>

      <div className="grid g2">
        <Card title="Timeline">
          <ul className="timeline">
            {o.timeline.map((t: any, i: number) => (
              <li key={i}>
                <div><b>{t.label}</b>{(t.reason || t.note || t.actorType) && <span className="muted"> · {t.reason ?? t.note ?? t.actorType.toLowerCase()}</span>}
                  {t.lat != null && <> · <a className="small" href={mapsLink(t.lat, t.lng)} target="_blank" rel="noreferrer">GPS</a></>}</div>
                <span className="muted small">{tm(t.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="stack">
          <Card title="Evidence at the door">
            <dl className="kv">
              <dt>Wait timer</dt><dd>{ev.waitMinutes != null ? `${Math.floor(ev.waitMinutes)}:${String(Math.round((ev.waitMinutes % 1) * 60)).padStart(2, '0')}` : '—'}{ev.gpsAtArrival ? ' · GPS at arrival' : ''}</dd>
              <dt>Calls</dt><dd>{x.calls.filter((c: any) => c.target === 'CUSTOMER').map((c: any) => tm(c.calledAt)).join(' · ') || 'None'}{ev.customerCalls ? ` · ${x.calls.find((c: any) => c.outcome)?.outcome?.toLowerCase().replace('_', ' ') ?? ''}` : ''}</dd>
              <dt>OTP</dt><dd>Sent {x.otpEvents.filter((e: any) => /SENT/.test(e.kind)).map((e: any) => tm(e.createdAt)).join(' + ') || '—'} · {ev.otpFailedAttempts} attempts{o.otp.locked ? ' · LOCKED' : ''}</dd>
              <dt>SMS / WhatsApp</dt><dd>{x.notifications.filter((n: any) => n.to && n.template?.includes('OTP')).map((n: any) => `${n.status.toLowerCase()} ${tm(n.createdAt)}`).slice(-1)[0] ?? '—'}</dd>
              {o.undeliveredReason && <><dt>Undelivered</dt><dd>{o.undeliveredReason}</dd></>}
            </dl>
            <p className="note">OTP values are never shown to staff.</p>
          </Card>
          <Card title="Wallet entries">
            {x.ledger.length ? (
              <table><tbody>
                {x.ledger.map((l: any) => <tr key={l.id}><td>{LEDGER_LABEL[l.type] ?? l.type}<div className="muted small">{l.reason}</div></td><td style={{ textAlign: 'right' }}>{ledgerAmount(l.type, l.amount)}</td></tr>)}
                {total > 0 && <tr><td><b>Total</b>{x.earnings.length > 0 && <span className="muted small"> · rider {rupees(riderTotal)} · platform {rupees(platformTotal)}</span>}</td><td style={{ textAlign: 'right' }}><b>{rupees(total)}</b></td></tr>}
              </tbody></table>
            ) : <p className="muted small">No money moved.</p>}
          </Card>
          {x.tickets.map((t: any) => (
            <Link key={t.id} href={`/admin/tickets?open=${t.id}`} className="alert info"><span>Linked ticket · “{t.subject}” · {t.status.toLowerCase().replace('_', ' ')}</span><span>›</span></Link>
          ))}
        </div>
        <Card title="People and places">
          <dl className="kv">
            <dt>Customer</dt><dd>{o.customer.name} · <a href={`tel:${o.customer.phone}`}>{o.customer.phone}</a></dd>
            <dt>Drop</dt><dd>{o.customer.address} {o.customer.landmark} · <a href={mapsLink(o.customer.lat, o.customer.lng)} target="_blank" rel="noreferrer">pin</a></dd>
            <dt>Pickup</dt><dd>{o.pickup.address} · <a href={mapsLink(o.pickup.lat, o.pickup.lng)} target="_blank" rel="noreferrer">pin</a></dd>
            <dt>Rider</dt><dd>{x.driver ? <>{x.driver.name} · {x.driver.phone} · {x.driver.vehicleNumber}</> : '—'}</dd>
            <dt>Rider location</dt><dd>{o.rider?.location ? <a href={mapsLink(o.rider.location.lat, o.rider.location.lng)} target="_blank" rel="noreferrer">{tm(o.rider.location.at)}</a> : '—'}</dd>
            <dt>Source</dt><dd>{o.source}{o.businessReferenceId && ` · ref ${o.businessReferenceId}`}</dd>
            <dt>Tracking</dt><dd><a href={o.trackingUrl} target="_blank" rel="noreferrer">customer link</a></dd>
          </dl>
        </Card>
        <Card title="Offers and messages">
          <h3>Assignment offers</h3>{x.offers.map((f: any) => <div key={f.id} className="small">round {f.round} · {f.driver.name} · {f.distanceKm} km · {f.status.toLowerCase()}</div>)}
          <h3 style={{ marginTop: 8 }}>Notifications</h3>{x.notifications.map((n: any) => <div key={n.id} className="small">{tm(n.createdAt)} · {n.channel} → {n.to} · {n.template} · {n.status.toLowerCase()}</div>)}
        </Card>
      </div>
    </>
  );
}

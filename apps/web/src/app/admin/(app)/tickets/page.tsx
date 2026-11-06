'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Card, Chips, Empty, ErrorBox, PageHead, StatusBadge, usePoll } from '@/components/ui';
import { api, ago, tm } from '@/lib/api';

const QUICK: { key: string; label: string }[] = [
  { key: 'WALLET_DISPUTE', label: 'Explain ₹35 + ₹25' },
  { key: 'WHERE_IS_MY_PARCEL', label: 'Where is my parcel' },
  { key: 'NO_RIDER', label: 'No rider' },
  { key: 'LOSS_DAMAGE', label: 'Loss or damage' },
];
const PRIORITY: Record<string, string> = { HIGH: 'High', URGENT: 'Urgent', NORMAL: 'Normal', LOW: 'Low' };

/** Builds the evidence reply from the order so support never has to type the call log by hand. */
function evidenceReply(name: string, o: any) {
  const calls = o.calls.filter((c: any) => c.target === 'CUSTOMER').map((c: any) => tm(c.calledAt));
  const arrived = o.order.timeline.find((t: any) => t.status === 'ARRIVED');
  const wait = o.evidence.waitMinutes != null ? Math.round(o.evidence.waitMinutes) : null;
  return `Hi ${name}, ${o.driver?.name.split(' ')[0] ?? 'the rider'} reached the drop at ${tm(arrived?.at)}${o.evidence.gpsAtArrival ? ' (GPS at the pin)' : ''}${wait != null ? `, waited ${wait} minutes` : ''} and called ${calls.length} time${calls.length === 1 ? '' : 's'} from the app${calls.length ? ` at ${calls.join(', ')}` : ''} with no answer. That's why the forward and return charges were applied. Call log attached.`;
}

/** A04 · Support tickets: list and thread side by side. */
function Tickets() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<'open' | 'RESOLVED' | 'all'>('open');
  const q = status === 'open' ? 'OPEN,IN_PROGRESS' : status === 'all' ? '' : status;
  const list = usePoll(() => api(`/admin/tickets?status=${q}`, { kind: 'admin' }), 15000, [q]);
  const [open, setOpen] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [canned, setCanned] = useState<Record<string, string>>({});
  const [reply, setReply] = useState('');
  const [error, setError] = useState<unknown>(null);
  const show = async (id: string) => {
    try {
      const t = await api(`/admin/tickets/${id}`, { kind: 'admin' });
      setOpen(t); setReply('');
      setOrder(t.orderId ? await api(`/admin/orders/${t.orderId}`, { kind: 'admin' }) : null);
    } catch (e) { setError(e); }
  };
  useEffect(() => { api('/admin/tickets/canned-replies', { kind: 'admin' }).then(setCanned).catch(() => {}); const id = sp.get('open'); if (id) show(id); }, [sp]);
  const patch = async (body: unknown) => { await api(`/admin/tickets/${open.id}`, { kind: 'admin', method: 'PATCH', body }); await show(open.id); await list.reload(); };
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  const first = open?.messages?.[0];
  return (
    <>
      <PageHead title="Support tickets" right={<Chips value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'all', label: 'All' }]} />} />
      <ErrorBox error={error || list.error} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="list">
          {(list.data ?? []).map((t: any) => (
            <button key={t.id} className="item" style={{ textAlign: 'left', alignItems: 'stretch', borderColor: open?.id === t.id ? 'var(--teal)' : undefined }} onClick={() => show(t.id)}>
              <span className="row between"><b>{t.subject}</b><span className={`badge s-${t.priority}`}>{PRIORITY[t.priority] ?? t.priority}</span></span>
              <span className="small muted">{t.business?.name ?? (t.driverId ? 'Rider' : '—')} · {t.type.toLowerCase().replace(/_/g, ' ')} · {ago(t.createdAt)}</span>
            </button>
          ))}
          {list.data && !list.data.length && <Empty>No tickets here.</Empty>}
        </div>
        {open ? (
          <Card title={open.subject} right={<div className="seg">
            <button className={open.status !== 'RESOLVED' ? 'on' : ''} onClick={() => run(() => patch({ status: 'IN_PROGRESS' }))}>In progress</button>
            <button className={open.status === 'RESOLVED' ? 'on' : ''} onClick={() => run(async () => { const r = prompt('Resolution'); if (r) await patch({ status: 'RESOLVED', resolution: r }); })}>Resolved</button>
          </div>}>
            <div className="stack">
              {first && <div className="card soft"><b>{open.business?.name ?? first.authorType.toLowerCase()}:</b> “{first.body}”</div>}
              {order && (
                <div className="card soft">
                  <Link href={`/admin/orders/${order.order.id}`}>Open {order.order.code} ›</Link>
                  <div className="row small" style={{ marginTop: 6 }}>
                    <span className="badge">Waited {order.evidence.waitMinutes != null ? `${Math.round(order.evidence.waitMinutes)} min` : '—'}</span>
                    <span className="badge">{order.evidence.customerCalls} calls logged</span>
                    <span className="badge">{order.evidence.gpsAtArrival ? 'GPS at pin' : 'No GPS at arrival'}</span>
                    <span className="badge">OTP {order.evidence.otpFailedAttempts} attempts</span>
                  </div>
                </div>
              )}
              {open.messages.slice(1).map((m: any) => <p key={m.id} style={{ margin: 0 }}><b>{m.authorType === 'ADMIN' ? 'Support' : m.authorType.toLowerCase()}</b> <span className="muted small">{tm(m.createdAt)}</span><br />{m.body}</p>)}
              {open.resolution && <div className="alert ok"><span>{open.resolution}</span></div>}
              <div className="chips">
                {order && <button className="chip" onClick={() => setReply(evidenceReply(open.business?.ownerName?.split(' ')[0] ?? 'there', order))}>Share call log</button>}
                {QUICK.filter((k) => canned[k.key]).map((k) => <button key={k.key} className="chip" onClick={() => setReply(canned[k.key])}>{k.label}</button>)}
                {open.businessId && <Link className="chip" style={{ display: 'inline-flex', alignItems: 'center' }} href={`/admin/businesses/${open.businessId}${open.orderId ? `?order=${open.orderId}` : ''}#wallet`}>Offer goodwill credit</Link>}
              </div>
              <label>Reply<textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} /></label>
              <div className="row between">
                <button className="secondary" onClick={() => run(() => patch({ priority: 'URGENT' }))}>Escalate</button>
                <div className="row">
                  <button className="secondary" disabled={!reply.trim()} onClick={() => run(async () => { setOpen(await api(`/admin/tickets/${open.id}/reply`, { kind: 'admin', body: { body: reply } })); setReply(''); })}>Send</button>
                  <button disabled={!reply.trim()} onClick={() => run(async () => { await api(`/admin/tickets/${open.id}/reply`, { kind: 'admin', body: { body: reply } }); await patch({ status: 'RESOLVED', resolution: reply.slice(0, 280) }); setReply(''); })}>Send &amp; resolve</button>
                </div>
              </div>
            </div>
          </Card>
        ) : <Empty>Pick a ticket to read the thread and the order evidence.</Empty>}
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Tickets /></Suspense>; }

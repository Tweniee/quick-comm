'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Card, Empty, ErrorBox, PageHead, StatusBadge, usePoll } from '@/components/ui';
import { api, ago, tm } from '@/lib/api';

const TOPICS: { type: string; label: string; subject: string }[] = [
  { type: 'WHERE_IS_MY_PARCEL', label: 'Where is my parcel?', subject: 'Where is my parcel?' },
  { type: 'WALLET_DISPUTE', label: 'Why was I charged?', subject: 'Why was I charged?' },
  { type: 'NO_RIDER', label: 'No rider available', subject: 'No rider available' },
  { type: 'LOSS_DAMAGE', label: 'Lost or damaged', subject: 'Parcel lost or damaged' },
];

/** B18 · Support. */
function Support() {
  const sp = useSearchParams();
  const list = usePoll(() => api('/business/tickets', { kind: 'business' }), 20000);
  const preset = TOPICS.find((t) => t.type === sp.get('type'));
  const [f, setF] = useState<Record<string, string> | null>(preset ? { type: preset.type, subject: `${preset.subject}${sp.get('order') ? ` · ${sp.get('order')}` : ''}`, orderId: sp.get('order') ?? '' } : null);
  const [open, setOpen] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  return (
    <>
      <PageHead title="Support" right={<span className="badge">9 am – 9 pm</span>} />
      <ErrorBox error={error || list.error} />
      {!f && <div className="grid g2" style={{ gap: 8 }}>{TOPICS.map((t) => <button key={t.type} className="item" style={{ textAlign: 'left', fontWeight: 600 }} onClick={() => setF({ type: t.type, subject: t.subject })}>{t.label}</button>)}</div>}
      {f && (
        <Card title="New ticket">
          <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/business/tickets', { kind: 'business', body: { ...f, orderId: f.orderId || undefined } }); setF(null); await list.reload(); }); }}>
            <div className="chips">{TOPICS.map((t) => <button type="button" key={t.type} className={`chip ${f.type === t.type ? 'on' : ''}`} onClick={() => setF({ ...f, type: t.type, subject: t.subject })}>{t.label}</button>)}</div>
            <label>Order code <span className="hint">optional, TW-…</span><input value={f.orderId ?? ''} onChange={(e) => setF({ ...f, orderId: e.target.value.toUpperCase() })} /></label>
            <label>Subject<input required value={f.subject ?? ''} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
            <label>Details<textarea required rows={4} value={f.body ?? ''} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
            {f.type === 'LOSS_DAMAGE' && <p className="note" style={{ margin: 0 }}>Raise within 24 hours with the invoice and a packing photo. Liability is capped at the lower of order value or ₹5,000.</p>}
            <div className="row"><button>Send to support</button><button type="button" className="secondary" onClick={() => setF(null)}>Cancel</button></div>
          </form>
        </Card>
      )}
      <p className="note">Loss claims: raise within 24 hours with the invoice and packing photo.</p>
      <h3 style={{ margin: 0 }}>Your tickets</h3>
      <div className="list">
        {(list.data ?? []).map((t: any) => (
          <button key={t.id} className="item" style={{ textAlign: 'left', borderColor: open?.id === t.id ? 'var(--teal)' : undefined }} onClick={() => run(async () => setOpen(await api(`/business/tickets/${t.id}`, { kind: 'business' })))}>
            <span className="row between"><b>{t.subject}</b><StatusBadge status={t.status} /></span>
            <span className="small muted">{ago(t.createdAt)} ago{t.resolution ? ` · ${t.resolution}` : ''}</span>
          </button>
        ))}
        {list.data && !list.data.length && <Empty>No tickets yet.</Empty>}
      </div>
      {open && (
        <Card title={open.subject} right={<StatusBadge status={open.status} />}>
          {open.messages.map((m: any) => <p key={m.id}><b>{m.authorType === 'ADMIN' ? 'Support' : 'You'}</b> <span className="muted small">{tm(m.createdAt)}</span><br />{m.body}</p>)}
          {open.resolution && <div className="alert ok"><span>Resolution: {open.resolution}</span></div>}
          <div className="row"><input style={{ flex: 1 }} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" />
            <button disabled={!reply.trim()} onClick={() => run(async () => { setOpen(await api(`/business/tickets/${open.id}/reply`, { kind: 'business', body: { body: reply } })); setReply(''); })}>Send</button></div>
        </Card>
      )}
      <div className="card soft row between"><span><b>GST invoices</b><div className="small muted">Monthly invoices will appear here once the invoice format is confirmed with finance. Your passbook export has every charge until then.</div></span></div>
    </>
  );
}
export default function Page() { return <Suspense><Support /></Suspense>; }

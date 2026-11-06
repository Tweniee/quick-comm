'use client';
import { useState } from 'react';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, dt } from '@/lib/api';

const TYPES = [['WHERE_IS_MY_PARCEL', 'Where is my parcel'], ['WALLET_DISPUTE', 'Wallet / charge question'], ['RIDER_ISSUE', 'Rider issue'], ['LOSS_DAMAGE', 'Lost or damaged parcel (within 24 h)'], ['BUSINESS_ISSUE', 'Account / other']];

export default function Support() {
  const list = usePoll(() => api('/business/tickets', { kind: 'business' }), 20000);
  const [open, setOpen] = useState<any>(null);
  const [f, setF] = useState<Record<string, string>>({ type: 'WHERE_IS_MY_PARCEL' });
  const [reply, setReply] = useState('');
  const [error, setError] = useState<unknown>(null);
  const show = async (id: string) => setOpen(await api(`/business/tickets/${id}`, { kind: 'business' }));
  return (
    <>
      <h1>Support</h1>
      <ErrorBox error={error || list.error} />
      <div className="grid g2">
        <Card title="New ticket">
          <form className="form" onSubmit={async (e) => { e.preventDefault(); setError(null); try { await api('/business/tickets', { kind: 'business', body: f }); setF({ type: f.type }); await list.reload(); } catch (err) { setError(err); } }}>
            <label>Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>Order code <span className="hint">optional</span><input value={f.orderId ?? ''} onChange={(e) => setF({ ...f, orderId: e.target.value })} /></label>
            <label>Subject<input required value={f.subject ?? ''} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
            <label>Details<textarea required rows={4} value={f.body ?? ''} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
            {f.type === 'LOSS_DAMAGE' && <p className="muted small">Include the invoice, parcel value proof and a packing photo if you have one. We investigate within 2 business days. Liability is capped at the lower of order value or ₹5,000.</p>}
            <button>Create ticket</button>
          </form>
        </Card>
        <Card title="Your tickets">
          <table><tbody>{(list.data ?? []).map((t: any) => (
            <tr key={t.id} onClick={() => show(t.id)} style={{ cursor: 'pointer' }}><td>{t.subject}</td><td><StatusBadge status={t.status} /></td><td className="small muted">{dt(t.createdAt)}</td></tr>
          ))}</tbody></table>
        </Card>
      </div>
      {open && (
        <Card title={open.subject} right={<StatusBadge status={open.status} />}>
          {open.messages.map((m: any) => <p key={m.id}><b>{m.authorType === 'ADMIN' ? 'Support' : 'You'}</b> <span className="muted small">{dt(m.createdAt)}</span><br />{m.body}</p>)}
          {open.resolution && <div className="alert ok"><span>Resolution: {open.resolution}</span></div>}
          <div className="row"><input style={{ flex: 1 }} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" />
            <button onClick={async () => { try { setOpen(await api(`/business/tickets/${open.id}/reply`, { kind: 'business', body: { body: reply } })); setReply(''); } catch (e) { setError(e); } }}>Send</button></div>
        </Card>
      )}
    </>
  );
}

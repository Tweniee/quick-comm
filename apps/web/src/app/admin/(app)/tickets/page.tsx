'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, dt } from '@/lib/api';

function Tickets() {
  const sp = useSearchParams();
  const [status, setStatus] = useState('OPEN,IN_PROGRESS');
  const list = usePoll(() => api(`/admin/tickets?status=${status}`, { kind: 'admin' }), 15000, [status]);
  const [open, setOpen] = useState<any>(null);
  const [canned, setCanned] = useState<Record<string, string>>({});
  const [reply, setReply] = useState('');
  const [error, setError] = useState<unknown>(null);
  const show = async (id: string) => { try { setOpen(await api(`/admin/tickets/${id}`, { kind: 'admin' })); } catch (e) { setError(e); } };
  useEffect(() => { api('/admin/tickets/canned-replies', { kind: 'admin' }).then(setCanned); const id = sp.get('open'); if (id) show(id); }, [sp]);
  return (
    <>
      <h1>Support tickets</h1>
      <div className="tabs">{[['OPEN,IN_PROGRESS', 'Open'], ['RESOLVED', 'Resolved'], ['', 'All']].map(([v, l]) => <button key={l} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}</button>)}</div>
      <ErrorBox error={error || list.error} />
      <div className="grid g2">
        <Card>
          <table><tbody>{(list.data ?? []).map((t: any) => (
            <tr key={t.id} onClick={() => show(t.id)} style={{ cursor: 'pointer' }}>
              <td>{t.subject}<div className="muted small">{t.type} · {t.business?.name ?? (t.driverId ? 'Rider' : '—')}</div></td>
              <td><span className="badge">{t.priority}</span></td><td><StatusBadge status={t.status} /></td><td className="small muted">{dt(t.createdAt)}</td>
            </tr>
          ))}</tbody></table>
        </Card>
        {open && (
          <Card title={open.subject} right={<StatusBadge status={open.status} />}>
            <p className="small muted">{open.type} · {open.business?.name} {open.orderId && <> · <Link href={`/admin/orders/${open.orderId}`}>open order</Link></>}</p>
            {open.messages.map((m: any) => <p key={m.id}><b>{m.authorType}</b> <span className="muted small">{dt(m.createdAt)}</span><br />{m.body}</p>)}
            {open.resolution && <div className="alert ok"><span>{open.resolution}</span></div>}
            <div className="row" style={{ marginBottom: 8 }}>{Object.entries(canned).map(([k, v]) => <button key={k} className="secondary" onClick={() => setReply(v)}>{k.replace(/_/g, ' ').toLowerCase()}</button>)}</div>
            <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" />
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={async () => { try { setOpen(await api(`/admin/tickets/${open.id}/reply`, { kind: 'admin', body: { body: reply } })); setReply(''); } catch (e) { setError(e); } }}>Send reply</button>
              <button className="secondary" onClick={async () => { const resolution = prompt('Resolution'); if (!resolution) return; try { await api(`/admin/tickets/${open.id}`, { kind: 'admin', method: 'PATCH', body: { status: 'RESOLVED', resolution } }); await show(open.id); await list.reload(); } catch (e) { setError(e); } }}>Resolve</button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Tickets /></Suspense>; }

'use client';
import { useState } from 'react';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, rupees, session } from '@/lib/api';

export default function Payouts() {
  const [status, setStatus] = useState('PENDING');
  const list = usePoll(() => api(`/admin/payouts${status ? `?status=${status}` : ''}`, { kind: 'admin' }), 30000, [status]);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const [week, setWeek] = useState('');
  const run = async (fn: () => Promise<any>) => { setError(null); setOk(''); try { const r = await fn(); setOk(typeof r === 'object' && r?.payouts != null ? `Generated ${r.payouts} payouts` : 'Done'); await list.reload(); } catch (e) { setError(e); } };
  return (
    <>
      <h1>Driver payouts</h1>
      <p className="muted">Earnings accrue per completed leg (₹28 delivery, ₹20 return at 80%). Each week, generate statements, export the bank file, transfer, then mark paid with the UTR.</p>
      <ErrorBox error={error || list.error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      <Card>
        <div className="row">
          <label style={{ width: 220 }}>Week starting (Monday)<input type="date" value={week} onChange={(e) => setWeek(e.target.value)} /></label>
          <button onClick={() => run(() => api('/admin/payouts/generate', { kind: 'admin', body: week ? { weekStart: week } : {} }))}>Generate {week ? 'for week' : 'for last week'}</button>
          <button className="secondary" disabled={!week} onClick={async () => {
            const res = await fetch(`/api/admin/payouts/export?weekStart=${week}`, { headers: { Authorization: `Bearer ${session.get('admin')}` } });
            const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = `payouts-${week}.csv`; a.click();
          }}>Export bank file</button>
        </div>
      </Card>
      <div className="tabs">{['PENDING', 'HELD', 'PAID', 'FAILED', ''].map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s || 'All'}</button>)}</div>
      <Card>
        <div className="table-wrap"><table>
          <thead><tr><th>Week</th><th>Driver</th><th>Bank</th><th>Legs</th><th>Net pay</th><th>Status</th><th></th></tr></thead>
          <tbody>{(list.data ?? []).map((p: any) => (
            <tr key={p.id}>
              <td className="small">{new Date(p.weekStart).toLocaleDateString()}</td>
              <td>{p.driver.name}<div className="muted small">{p.driver.phone}</div></td>
              <td className="small">XXXX{p.driver.bankAccountLast4} · {p.driver.ifsc}</td>
              <td>{p.deliveryCount} del / {p.returnCount} ret</td>
              <td><b>{rupees(p.netPay)}</b></td>
              <td><StatusBadge status={p.status} />{p.reference && <div className="small muted">{p.reference}</div>}</td>
              <td>{['PENDING', 'FAILED'].includes(p.status) && <button className="link" onClick={() => { const ref = prompt('Bank transfer reference (UTR)'); if (ref) run(() => api(`/admin/payouts/${p.id}/status`, { kind: 'admin', body: { status: 'PAID', reference: ref } })); }}>Mark paid</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
    </>
  );
}

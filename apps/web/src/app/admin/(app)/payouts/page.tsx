'use client';
import { useMemo, useState } from 'react';
import { Chips, ErrorBox, PageHead, Stat, StatusBadge, usePoll } from '@/components/ui';
import { api, rupees, session } from '@/lib/api';

const d = (x: string | Date) => new Date(x).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const STATUS_TEXT: Record<string, string> = { PENDING: 'Pending', HELD: 'Held · re-verify bank', PAID: 'Paid', FAILED: 'Failed · retry' };

/** A12 · Weekly driver payouts. */
export default function Payouts() {
  const all = usePoll(() => api('/admin/payouts', { kind: 'admin' }), 30000);
  const weeks: string[] = useMemo(() => [...new Set<string>((all.data ?? []).map((p: any) => p.weekStart as string))], [all.data]);
  const [picked, setPicked] = useState('');
  const week = picked || weeks[0] || '';
  const rows = (all.data ?? []).filter((p: any) => p.weekStart === week);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const run = async (fn: () => Promise<any>, msg?: string) => { setError(null); setOk(''); try { const r = await fn(); setOk(msg ?? (r?.payouts != null ? `Statements ready for ${r.payouts} drivers` : 'Done')); await all.reload(); } catch (e) { setError(e); } };
  const driverPay = rows.reduce((s: number, p: any) => s + p.netPay, 0);
  const gross = rows.reduce((s: number, p: any) => s + p.grossPay, 0);
  const platform = Math.round(gross / 4); // 80/20 split: platform is a quarter of the rider share
  const end = rows[0]?.weekEnd;
  return (
    <>
      <PageHead title={`Payouts${week ? ` · week ${d(week)} – ${d(new Date(new Date(end ?? week).getTime() - 1))}` : ''}`} right={<>
        <button onClick={() => run(() => api('/admin/payouts/generate', { kind: 'admin', body: {} }))}>Run Monday payout</button>
        <button className="secondary" disabled={!week} onClick={async () => {
          const res = await fetch(`/api/admin/payouts/export?weekStart=${week.slice(0, 10)}`, { headers: { Authorization: `Bearer ${session.get('admin')}` } });
          const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = `payouts-${week.slice(0, 10)}.csv`; a.click();
        }}>Export bank file</button>
      </>} />
      {weeks.length > 1 && <Chips value={week} onChange={setPicked} options={weeks.slice(0, 6).map((w) => ({ value: w, label: `Week of ${d(w)}` }))} />}
      <ErrorBox error={error || all.error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      <div className="grid g4">
        <Stat label="Drivers to pay" value={rows.filter((p: any) => p.status === 'PENDING').length} />
        <Stat label="Driver pay (80%)" value={rupees(driverPay)} />
        <Stat label="Platform (20%)" value={rupees(platform)} />
        <Stat label="On hold" value={rows.filter((p: any) => p.status === 'HELD').length} tone={rows.some((p: any) => p.status === 'HELD') ? 'warn' : undefined} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Driver</th><th>Deliveries</th><th>Returns</th><th>Adjustments</th><th>Net</th><th>Bank</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((p: any) => {
              const adj = p.netPay - p.grossPay;
              return (
                <tr key={p.id}>
                  <td><b>{p.driver.name}</b></td>
                  <td>{p.deliveryCount}</td>
                  <td>{p.returnCount}</td>
                  <td>{adj ? `${adj > 0 ? '+' : '−'}${rupees(Math.abs(adj))}` : '—'}</td>
                  <td><b>{rupees(p.netPay)}</b></td>
                  <td className="small">{p.driver.ifsc?.slice(0, 4) ?? ''} •••• {p.driver.bankAccountLast4 ?? '—'}</td>
                  <td><span className={`badge s-${p.status}`}>{STATUS_TEXT[p.status] ?? p.status}</span>{p.reference && <div className="small muted">{p.reference}</div>}</td>
                  <td className="row">
                    {['PENDING', 'FAILED', 'HELD'].includes(p.status) && <button className="link" onClick={() => { const ref = prompt('Bank transfer reference (UTR)'); if (ref) run(() => api(`/admin/payouts/${p.id}/status`, { kind: 'admin', body: { status: 'PAID', reference: ref } }), 'Marked paid'); }}>Mark paid</button>}
                    {p.status === 'PENDING' && <button className="link" onClick={() => run(() => api(`/admin/payouts/${p.id}/status`, { kind: 'admin', body: { status: 'HELD' } }), 'Held')}>Hold</button>}
                  </td>
                </tr>
              );
            })}
            {all.data && !rows.length && <tr><td colSpan={8} className="muted">No statements yet. Run the Monday payout to create them.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">Paid only to the verified bank account. No cash, no UPI to unverified numbers. Driver payout money is kept in its own ledger, separate from business wallets.</p>
    </>
  );
}

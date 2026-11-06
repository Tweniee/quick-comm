'use client';
import Link from 'next/link';
import { ErrorBox, PageHead, usePoll } from '@/components/ui';
import { api, dt, LEDGER_LABEL, ledgerAmount, ledgerSign, rupees, tm } from '@/lib/api';

function exportCsv(rows: any[]) {
  const head = 'date,order,entry,amount_rupees,balance_after_rupees,reason';
  const body = rows.map((r) => [new Date(r.createdAt).toISOString(), r.order?.code ?? '', LEDGER_LABEL[r.type] ?? r.type, ((ledgerSign(r.type) || 1) * r.amount / 100).toFixed(2), (r.balanceAfter / 100).toFixed(2), `"${String(r.reason).replace(/"/g, '""')}"`].join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[head, ...body].join('\n')], { type: 'text/csv' })); a.download = 'passbook.csv'; a.click();
}
const when = (d: string) => (new Date(d).toDateString() === new Date().toDateString() ? tm(d) : dt(d));

/** B15 · Wallet and passbook. */
export default function Wallet() {
  const w = usePoll(() => api('/business/wallet', { kind: 'business' }), 20000);
  const pb = usePoll(() => api('/business/wallet/passbook?take=200', { kind: 'business' }), 30000);
  const s = w.data;
  return (
    <>
      <PageHead title="Wallet" />
      <ErrorBox error={w.error || pb.error} />
      <div className="hero">
        <span className="muted small">Balance · shared by all branches</span>
        <span style={{ fontFamily: 'var(--display)', fontSize: 40, fontWeight: 700 }}>{rupees(s?.available)}</span>
        {s?.held > 0 && <span className="small muted">{rupees(s.held)} held for orders with a rider · {rupees(s.balance)} total</span>}
        <div className="row"><Link className="btn" href="/business/wallet/recharge">Recharge</Link><button className="secondary" onClick={() => exportCsv(pb.data ?? [])}>Export passbook</button></div>
      </div>
      <p className="note">We warn you at ₹200 and block new orders below {rupees(s?.requiredToCreate)}, the most one order can cost.</p>
      <h3 style={{ margin: 0 }}>Passbook</h3>
      <div className="list">
        {(pb.data ?? []).map((r: any) => (
          <div key={r.id} className="item">
            <span className="row between"><b>{LEDGER_LABEL[r.type] ?? r.type}{r.order?.code ? ` · ${r.order.code}` : ''}</b><b className={ledgerSign(r.type) > 0 ? 'ok-t' : ledgerSign(r.type) < 0 ? 'bad-t' : 'muted'}>{ledgerAmount(r.type, r.amount)}</b></span>
            <span className="row between small muted"><span>{when(r.createdAt)} · {r.reason}</span><span>{rupees(r.balanceAfter)}</span></span>
          </div>
        ))}
      </div>
    </>
  );
}

'use client';
import { useState } from 'react';
import { Card, ErrorBox, Stat, usePoll } from '@/components/ui';
import { api, dt, rupees } from '@/lib/api';

const CREDIT = ['RECHARGE', 'CREDIT', 'REFUND', 'RELEASE'];

function exportCsv(rows: any[]) {
  const head = 'date,order,type,amount_rupees,balance_after_rupees,reason';
  const body = rows.map((r) => [new Date(r.createdAt).toISOString(), r.order?.code ?? '', r.type, (r.amount / 100).toFixed(2), (r.balanceAfter / 100).toFixed(2), `"${r.reason.replace(/"/g, '""')}"`].join(','));
  const url = URL.createObjectURL(new Blob([[head, ...body].join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'passbook.csv'; a.click();
  URL.revokeObjectURL(url);
}

declare global { interface Window { Razorpay?: any } }

export default function Wallet() {
  const w = usePoll(() => api('/business/wallet', { kind: 'business' }), 20000);
  const pb = usePoll(() => api('/business/wallet/passbook?take=200', { kind: 'business' }), 30000);
  const [amount, setAmount] = useState('1000');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');

  async function recharge() {
    setBusy(true); setError(null); setOk('');
    try {
      const r = await api('/business/wallet/recharges', { kind: 'business', body: { amount: Math.round(Number(amount) * 100) } });
      if (r.provider === 'mock') {
        if (!confirm(`Development mode: simulate a successful payment of ₹${amount}?`)) return;
        await api(`/business/wallet/recharges/${r.rechargeId}/mock-pay`, { kind: 'business', body: {} });
        setOk('Recharge successful');
      } else if (r.provider === 'razorpay') {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = () => res(); s.onerror = () => rej(new Error('Could not load payment page'));
          document.body.appendChild(s);
        });
        new window.Razorpay({ key: r.keyId, order_id: r.razorpayOrderId, amount: r.amount, currency: 'INR', name: 'Tweniee wallet',
          handler: () => setOk('Payment received. Your wallet will update in a few seconds.') }).open();
      }
      await w.reload(); await pb.reload();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  const s = w.data;
  return (
    <>
      <h1>Wallet</h1>
      <ErrorBox error={error || w.error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Available" value={rupees(s?.available)} tone={s?.lowBalance ? 'warn' : 'ok'} />
        <Stat label="Balance" value={rupees(s?.balance)} />
        <Stat label="Held for assigned orders" value={rupees(s?.held)} />
        <Stat label="Per delivery / return" value={`${rupees(s?.deliveryFee)} / ${rupees(s?.returnFee)}`} />
      </div>
      <Card title="Recharge">
        <div className="row">
          <input style={{ width: 160 }} type="number" min={(s?.minRecharge ?? 50000) / 100} value={amount} onChange={(e) => setAmount(e.target.value)} />
          {[500, 1000, 2000, 5000].map((v) => <button key={v} className="secondary" onClick={() => setAmount(String(v))}>₹{v}</button>)}
          <button disabled={busy} onClick={recharge}>{busy ? 'Processing…' : `Recharge ₹${amount}`}</button>
        </div>
        <p className="muted small">UPI, cards and net banking. Minimum {rupees(s?.minRecharge)}. Prepaid only: no credit, no COD.</p>
      </Card>
      <Card title="Passbook" right={<button className="secondary" onClick={() => exportCsv(pb.data ?? [])}>Export CSV</button>}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Order</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Reason</th></tr></thead>
            <tbody>
              {(pb.data ?? []).map((r: any) => (
                <tr key={r.id}>
                  <td className="small">{dt(r.createdAt)}</td>
                  <td className="mono small">{r.order?.code ?? '—'}</td>
                  <td>{r.type.replace('_', ' ')}</td>
                  <td style={{ color: CREDIT.includes(r.type) ? 'var(--ok)' : r.type === 'HOLD' ? 'var(--muted)' : 'var(--bad)' }}>{CREDIT.includes(r.type) ? '+' : r.type === 'HOLD' ? '' : '−'}{rupees(r.amount)}</td>
                  <td>{rupees(r.balanceAfter)}</td>
                  <td className="small">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

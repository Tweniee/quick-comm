'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorBox, PageHead, usePoll } from '@/components/ui';
import { api, rupees } from '@/lib/api';

declare global { interface Window { Razorpay?: any } }

/** B16 · Recharge. Razorpay shows UPI, net banking and cards in its own sheet. */
export default function Recharge() {
  const router = useRouter();
  const w = usePoll(() => api('/business/wallet', { kind: 'business' }), 60000);
  const [amount, setAmount] = useState(1000);
  const [method, setMethod] = useState('upi');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const min = (w.data?.minRecharge ?? 50000) / 100;
  const per = (w.data?.deliveryFee ?? 3500) / 100;
  async function pay() {
    setBusy(true); setError(null);
    try {
      const r = await api('/business/wallet/recharges', { kind: 'business', body: { amount: Math.round(amount * 100) } });
      if (r.provider === 'mock') {
        if (!confirm(`Test mode: simulate a successful payment of ₹${amount}?`)) return;
        await api(`/business/wallet/recharges/${r.rechargeId}/mock-pay`, { kind: 'business', body: {} });
        router.push('/business/wallet');
      } else {
        await new Promise<void>((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = () => res(); s.onerror = () => rej(new Error('Could not load the payment page')); document.body.appendChild(s); });
        new window.Razorpay({ key: r.keyId, order_id: r.razorpayOrderId, amount: r.amount, currency: 'INR', name: 'Tweniee wallet', config: { display: { preferences: { show_default_blocks: true } } }, prefill: { method }, handler: () => router.push('/business/wallet') }).open();
      }
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <>
      <PageHead title="Recharge wallet" />
      <ErrorBox error={error || w.error} />
      <div className="form" style={{ maxWidth: 520 }}>
        <label>Amount<input type="number" min={min} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ fontSize: 24, fontWeight: 700 }} /></label>
        <div className="chips">{[500, 1000, 2000, 5000].map((v) => <button key={v} className={`chip ${amount === v ? 'on' : ''}`} onClick={() => setAmount(v)}>₹{v.toLocaleString('en-IN')}</button>)}</div>
        <p className="small muted" style={{ margin: 0 }}>Minimum ₹{min}. About {Math.floor(amount / per)} deliveries at ₹{per}.</p>
        <b>Pay with</b>
        <div className="list">{[['upi', 'UPI'], ['netbanking', 'Net banking'], ['card', 'Debit or credit card']].map(([k, l]) => (
          <label key={k} className="item" style={{ flexDirection: 'row', alignItems: 'center', borderColor: method === k ? 'var(--teal)' : undefined }}><input type="radio" name="method" checked={method === k} onChange={() => setMethod(k)} />{l}</label>
        ))}</div>
        <p className="note">Wallet money pays only for deliveries. Refunds and corrections come back to the wallet and show in your passbook.</p>
        <button className="big" disabled={busy || amount < min} onClick={pay}>{busy ? 'Opening…' : `Pay ${rupees(amount * 100)}`}</button>
      </div>
    </>
  );
}

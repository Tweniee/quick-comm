'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LocationInput } from '@/components/LocationInput';
import { ErrorBox, PageHead } from '@/components/ui';
import { api, rupees } from '@/lib/api';

/** B07 · Create order, with B08 (low balance) in place of the fee box when the wallet is short. */
export default function NewOrder() {
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [f, setF] = useState<Record<string, any>>({ weightKg: '1', value: '', isFragile: false });
  const [pin, setPin] = useState<{ lat?: number; lng?: number }>({});
  const [note, setNote] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/business/orders/quote', { kind: 'business' }).then(setQuote).catch(setError);
    api('/business/me', { kind: 'business' }).then((b) => {
      setAddresses(b.addresses);
      const def = b.addresses.find((a: any) => a.isDefault) ?? b.addresses[0];
      if (def) setF((x) => ({ ...x, pickupAddressId: def.id }));
    }).catch(setError);
  }, []);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const short = quote && quote.walletAvailable < quote.requiredAvailable;

  async function submit() {
    setError(null);
    if (pin.lat == null) { setError(new Error('Set the delivery pin so the rider can navigate')); return; }
    setBusy(true);
    try {
      const o = await api('/business/orders', {
        kind: 'business',
        body: {
          pickupAddressId: f.pickupAddressId, customerName: f.customerName, customerPhone: f.customerPhone,
          dropAddress: f.dropAddress, dropLandmark: f.dropLandmark, dropPincode: f.dropPincode, dropLat: pin.lat, dropLng: pin.lng,
          parcelDescription: f.parcelDescription, weightGrams: Math.round(Number(f.weightKg) * 1000), declaredValue: Math.round(Number(f.value || 0) * 100),
          isFragile: f.isFragile, specialInstructions: f.specialInstructions || undefined, businessReferenceId: f.businessReferenceId || undefined, markReady: false,
        },
      });
      router.push(`/business/orders/${o.id}`);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="New delivery" />
      <ErrorBox error={error} actions={{ RECHARGE: <Link className="btn secondary" href="/business/wallet/recharge">Recharge</Link> }} />
      <form className="form" style={{ maxWidth: 640 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label>Customer phone<input required inputMode="numeric" placeholder="10 digit mobile" onChange={set('customerPhone')} /><span className="hint">The OTP and tracking link go here. A wrong number means a ₹60 return.</span></label>
        <label>Customer name<input required onChange={set('customerName')} /></label>
        <label>Delivery address<input required onChange={set('dropAddress')} placeholder="House, street, area" /></label>
        <div className="row">
          <label style={{ flex: 2 }}>Landmark<input placeholder="Near…" onChange={set('dropLandmark')} /></label>
          <label style={{ flex: 1 }}>Pincode<input inputMode="numeric" onChange={set('dropPincode')} /></label>
        </div>
        <LocationInput value={pin} onChange={setPin} label="Delivery pin" />
        <label>What&apos;s in the parcel<input required placeholder="Kurta set, cake box…" onChange={set('parcelDescription')} /></label>
        <div className="row">
          <label style={{ flex: 1 }}>Weight (kg)<input required type="number" step="0.1" min="0.1" max="20" value={f.weightKg} onChange={set('weightKg')} /></label>
          <label style={{ flex: 1 }}>Value (₹)<input required type="number" min="0" onChange={set('value')} /></label>
        </div>
        <p className="note" style={{ margin: 0 }}>Max 20 kg, must fit a 45×35×35 cm bike box. Liability capped at ₹5,000.</p>
        {addresses.length > 1 && (
          <label>Pickup from<div className="chips">{addresses.map((a) => <button type="button" key={a.id} className={`chip ${f.pickupAddressId === a.id ? 'on' : ''}`} onClick={() => setF({ ...f, pickupAddressId: a.id })}>{a.label}</button>)}</div></label>
        )}
        <div className="row">
          <label className="check"><input type="checkbox" onChange={set('isFragile')} />Fragile</label>
          {!note && <button type="button" className="link" onClick={() => setNote(true)}>+ Note for rider</button>}
        </div>
        {note && <div className="form two"><label>Note for rider<input onChange={set('specialInstructions')} /></label><label>Your order reference <span className="hint">optional</span><input onChange={set('businessReferenceId')} /></label></div>}
        {short ? (
          <div className="card" style={{ borderColor: 'var(--bad)' }}>
            <b className="bad-t">Recharge {rupees(quote.requiredAvailable - quote.walletAvailable)} to create this order</b>
            <p className="small" style={{ margin: '6px 0' }}>Your wallet has {rupees(quote.walletAvailable)}. Orders are blocked below {rupees(quote.requiredAvailable)} so we never create a delivery you can&apos;t pay for.</p>
            <Link className="btn big" href="/business/wallet/recharge">Recharge wallet</Link>
          </div>
        ) : (
          <div className="card soft row between">
            <span><b>Delivery fee {rupees(quote?.deliveryFee)}</b><div className="small muted">{rupees(quote?.undeliveredTotal)} is held when a rider accepts; {rupees(quote?.returnFee)} comes back on delivery. If the customer can&apos;t be reached, the {rupees(quote?.returnFee)} pays for the return.</div></span>
          </div>
        )}
        <button className="big" disabled={busy || !quote?.canCreate}>{busy ? 'Creating…' : 'Create order'}</button>
      </form>
    </>
  );
}

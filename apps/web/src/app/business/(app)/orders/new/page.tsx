'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LocationInput } from '@/components/LocationInput';
import { Card, ErrorBox } from '@/components/ui';
import { api, rupees } from '@/lib/api';

export default function NewOrder() {
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [f, setF] = useState<Record<string, any>>({ weightKg: '1', value: '', isFragile: false });
  const [pin, setPin] = useState<{ lat?: number; lng?: number }>({});
  const [more, setMore] = useState(false);
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

  async function submit(markReady: boolean) {
    setError(null);
    if (pin.lat == null) { setError(new Error('Set the delivery location pin')); return; }
    setBusy(true);
    try {
      const o = await api('/business/orders', {
        kind: 'business',
        body: {
          pickupAddressId: f.pickupAddressId, customerName: f.customerName, customerPhone: f.customerPhone,
          dropAddress: f.dropAddress, dropLandmark: f.dropLandmark, dropPincode: f.dropPincode, dropLat: pin.lat, dropLng: pin.lng,
          parcelDescription: f.parcelDescription, weightGrams: Math.round(Number(f.weightKg) * 1000), declaredValue: Math.round(Number(f.value || 0) * 100),
          lengthCm: f.lengthCm ? Number(f.lengthCm) : undefined, widthCm: f.widthCm ? Number(f.widthCm) : undefined, heightCm: f.heightCm ? Number(f.heightCm) : undefined,
          isFragile: f.isFragile, specialInstructions: f.specialInstructions, businessReferenceId: f.businessReferenceId || undefined, markReady,
        },
      });
      router.push(`/business/orders/${o.id}`);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <>
      <h1>New order</h1>
      <ErrorBox error={error} actions={{ RECHARGE: <Link className="btn secondary" href="/business/wallet">Recharge</Link>, COMPLETE_VERIFICATION: <Link className="btn secondary" href="/business/settings">Verification</Link> }} />
      <form className="card form" onSubmit={(e) => { e.preventDefault(); submit(true); }}>
        <div className="form two">
          <label>Customer phone<input required inputMode="numeric" placeholder="10 digit mobile" onChange={set('customerPhone')} /><span className="hint">The OTP and tracking link go to this number. Check it: a wrong number means a ₹60 return.</span></label>
          <label>Customer name<input required onChange={set('customerName')} /></label>
          <label>Delivery address<input required onChange={set('dropAddress')} /></label>
          <label>Landmark<input placeholder="Near…" onChange={set('dropLandmark')} /></label>
          <label>Pincode<input onChange={set('dropPincode')} /></label>
          <label>Pickup from<select value={f.pickupAddressId ?? ''} onChange={set('pickupAddressId')}>{addresses.map((a) => <option key={a.id} value={a.id}>{a.label}: {a.address}</option>)}</select></label>
        </div>
        <LocationInput value={pin} onChange={setPin} label="Delivery location pin" />
        <div className="form two">
          <label>What is it?<input required placeholder="e.g. Cake box, 2 kurtas" onChange={set('parcelDescription')} /></label>
          <label>Weight (kg)<input required type="number" step="0.1" min="0.1" max="20" value={f.weightKg} onChange={set('weightKg')} /><span className="hint">Bike limit: 20 kg, must fit a 45×35×35 cm box.</span></label>
          <label>Parcel value (₹)<input required type="number" min="0" onChange={set('value')} />{Number(f.value) > 5000 && <span className="hint" style={{ color: 'var(--warn)' }}>Liability is capped at ₹5,000. Use your own insurance for more cover.</span>}</label>
        </div>
        <button type="button" className="link" onClick={() => setMore(!more)}>{more ? 'Hide' : 'More options'} (size, fragile, instructions, your reference)</button>
        {more && (
          <div className="form two">
            <label>Length (cm)<input type="number" onChange={set('lengthCm')} /></label>
            <label>Width (cm)<input type="number" onChange={set('widthCm')} /></label>
            <label>Height (cm)<input type="number" onChange={set('heightCm')} /></label>
            <label>Your order reference<input onChange={set('businessReferenceId')} /></label>
            <label>Instructions for rider<input onChange={set('specialInstructions')} /></label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} onChange={set('isFragile')} /> Fragile (pack with protection)</label>
          </div>
        )}
        <Card>
          <div className="row between">
            <div>
              <div><b>Delivery fee {rupees(quote?.deliveryFee)}</b> <span className="muted">charged when the rider picks up</span></div>
              <div className="muted small">{rupees(quote?.undeliveredTotal)} is held when a rider accepts; {rupees(quote?.returnFee)} of it comes back once delivered, or is charged as the return if the customer can't be reached. Wallet available: {rupees(quote?.walletAvailable)}.</div>
              {quote?.message && <div className="small" style={{ color: 'var(--bad)' }}>{quote.message}</div>}
            </div>
            <div className="row">
              <button type="button" className="secondary" disabled={busy || quote?.canCreate === false} onClick={() => submit(false)}>Save, not packed yet</button>
              <button disabled={busy || quote?.canCreate === false}>{busy ? 'Creating…' : 'Create & mark Ready'}</button>
            </div>
          </div>
          {quote?.message && <div className="alert warn" style={{ marginTop: 12 }}><span>{quote.message}</span><Link className="btn secondary" href="/business/wallet">Recharge</Link></div>}
        </Card>
        <p className="muted small">Mark Ready only when the parcel is packed, sealed and labelled with the order code, customer name and phone. We look for a rider only after Ready.</p>
      </form>
    </>
  );
}

'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LocationInput } from '@/components/LocationInput';
import { ErrorBox } from '@/components/ui';
import { api, session } from '@/lib/api';

const TYPES = [['INDIVIDUAL', 'Individual'], ['SOLE_PROPRIETORSHIP', 'Sole Proprietorship'], ['PARTNERSHIP', 'Partnership'], ['LLP', 'LLP'], ['PRIVATE_LIMITED', 'Private Limited']];

export default function Signup() {
  const router = useRouter();
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState<Record<string, any>>({ type: 'SOLE_PROPRIETORSHIP', acceptTerms: false });
  const [pin, setPin] = useState<{ lat?: number; lng?: number }>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/cities').then((c) => { setCities(c); if (c[0]) setF((x) => ({ ...x, cityId: c[0].id })); }).catch(setError); }, []);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  return (
    <div className="auth" style={{ maxWidth: 760 }}>
      <h1>Sign up your business</h1>
      <p className="muted">Every business is verified before it can ship. No monthly fee; you pay per delivery from a prepaid wallet.</p>
      <ErrorBox error={error} />
      <form className="card form" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        if (pin.lat == null) { setError(new Error('Set the pickup location pin')); return; }
        setBusy(true);
        try {
          const r = await api('/business/signup', { body: { ...f, pickup: { label: 'Main', address: f.pickupAddress, landmark: f.pickupLandmark, pincode: f.pickupPincode, lat: pin.lat, lng: pin.lng } } });
          session.set('business', r.token, { user: r.user, business: r.business });
          router.push('/business/settings?welcome=1');
        } catch (err) { setError(err); } finally { setBusy(false); }
      }}>
        <div className="form two">
          <label>Business name<input required onChange={set('name')} /></label>
          <label>Business type<select value={f.type} onChange={set('type')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Owner name<input required onChange={set('ownerName')} /></label>
          <label>Mobile<input required inputMode="numeric" onChange={set('phone')} /></label>
          <label>Email<input type="email" required onChange={set('email')} /></label>
          <label>Password<input type="password" required minLength={8} onChange={set('password')} /></label>
          <label>City<select value={f.cityId ?? ''} onChange={set('cityId')}>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Category<input placeholder="Bakery, clothing, pharmacy…" onChange={set('category')} /></label>
          <label>GSTIN <span className="hint">if registered</span><input onChange={set('gstin')} /></label>
          <label>PAN<input onChange={set('pan')} /></label>
        </div>
        <h3>Public presence <span className="muted small">(at least one, to prove the business is real)</span></h3>
        <div className="form two">
          <label>Website<input onChange={set('website')} /></label>
          <label>Instagram<input onChange={set('instagram')} /></label>
          <label>Google Business Profile<input onChange={set('googleProfile')} /></label>
        </div>
        <h3>Pickup address</h3>
        <div className="form two">
          <label>Address<input required onChange={set('pickupAddress')} /></label>
          <label>Landmark<input onChange={set('pickupLandmark')} /></label>
          <label>Pincode<input required onChange={set('pickupPincode')} /></label>
        </div>
        <LocationInput value={pin} onChange={setPin} label="Pickup location pin" />
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" style={{ width: 'auto' }} onChange={set('acceptTerms')} />
          I accept the business terms: parcels are legal and correctly described, sealed by us; OTP is required on every delivery; ₹35 per delivery and ₹25 extra if returned; liability capped at the lower of order value or ₹5,000; no delivery time promise.
        </label>
        <button disabled={busy || !f.acceptTerms}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="muted">Already registered? <Link href="/business/login">Log in</Link></p>
    </div>
  );
}

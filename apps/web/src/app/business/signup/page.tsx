'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { LocationInput } from '@/components/LocationInput';
import { ErrorBox, Logo, OtpBoxes } from '@/components/ui';
import { api, session } from '@/lib/api';

/** B01–B04 · Business signup: account → verify contact → details → KYC. The step is worked out from the account, so a refresh or a later login resumes in the right place. */
type Step = 'account' | 'otp' | 'details' | 'kyc';
const TYPES: [string, string][] = [['INDIVIDUAL', 'Individual'], ['SOLE_PROPRIETORSHIP', 'Sole proprietorship'], ['PARTNERSHIP', 'Partnership'], ['LLP', 'LLP'], ['PRIVATE_LIMITED', 'Private Limited']];
/** What each business type uploads (masterplan KYC matrix). */
const KYC: Record<string, { need: string; docs: [string, string][] }> = {
  INDIVIDUAL: { need: 'Individuals need PAN, a photo of where you pack orders, and pickup address proof.', docs: [['PAN', 'PAN card'], ['SHOP_PHOTO', 'Photo of your packing place'], ['ADDRESS_PROOF', 'Pickup address proof']] },
  SOLE_PROPRIETORSHIP: { need: 'Sole proprietorship needs GSTIN or Aadhaar, a shop licence or Udyam, and PAN.', docs: [['PAN', 'PAN card'], ['UDYAM', 'Udyam certificate or shop licence'], ['SHOP_PHOTO', 'Shop board photo'], ['ADDRESS_PROOF', 'Pickup address proof']] },
  PARTNERSHIP: { need: 'Partnerships need the firm PAN, partnership deed or GST certificate, and a shop photo.', docs: [['PAN', 'Firm PAN'], ['GST_CERT', 'GST certificate or partnership deed'], ['SHOP_PHOTO', 'Shop board photo'], ['ADDRESS_PROOF', 'Pickup address proof']] },
  LLP: { need: 'LLPs need the LLP PAN, incorporation certificate, and a shop or warehouse photo.', docs: [['PAN', 'LLP PAN'], ['INCORPORATION_CERT', 'Incorporation certificate'], ['SHOP_PHOTO', 'Shop or warehouse photo'], ['ADDRESS_PROOF', 'Pickup address proof']] },
  PRIVATE_LIMITED: { need: 'Private limited companies need the company PAN, incorporation certificate, and a shop or warehouse photo.', docs: [['PAN', 'Company PAN'], ['INCORPORATION_CERT', 'Incorporation certificate'], ['SHOP_PHOTO', 'Shop or warehouse photo'], ['ADDRESS_PROOF', 'Pickup address proof']] },
};

function Frame({ step, children }: { step?: number; children: React.ReactNode }) {
  return (
    <div className="phone">
      <div className="phone-top"><span className="row" style={{ gap: 8 }}><Logo /><b>Tweniee Business</b></span>{step && <span className="small">Step {step} of 4</span>}</div>
      {step && <div className="progress" style={{ borderRadius: 0 }}><i style={{ width: `${step * 25}%` }} /></div>}
      <div className="phone-body">{children}</div>
    </div>
  );
}

export default function Signup() {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const resume = useCallback(async () => {
    if (!session.get('business')) { setStep('account'); return; }
    try {
      const b = await api('/business/me', { kind: 'business' });
      setMe(b);
      if (b.status !== 'PENDING' || b.submittedAt) { router.replace('/business'); return; }
      if (!b.phoneVerifiedAt || !b.emailVerifiedAt) setStep('otp');
      else if (!b.addresses.length || !(b.website || b.instagram || b.googleProfile) || !b.category) setStep('details');
      else setStep('kyc');
    } catch { setStep('account'); }
  }, [router]);
  useEffect(() => { resume(); }, [resume]);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e); } finally { setBusy(false); } };

  if (!step) return <Frame><p>Loading…</p></Frame>;
  if (step === 'account') return <Account busy={busy} error={error} onSubmit={(body) => run(async () => {
    const cities = await api('/cities');
    const r = await api('/business/signup', { body: { ...body, cityId: cities[0]?.id } });
    session.set('business', r.token, { user: r.user, business: r.business });
    try { sessionStorage.setItem('tw.signup', JSON.stringify({ ...r.verification, sentAt: Date.now() })); } catch { /* ignore */ }
    await resume();
  })} />;
  if (step === 'otp') return <Otp me={me} busy={busy} error={error} run={run} done={resume} />;
  if (step === 'details') return <Details me={me} busy={busy} error={error} run={run} done={resume} />;
  return <Kyc me={me} busy={busy} error={error} run={run} done={() => router.replace('/business')} reload={resume} />;
}

function Account({ busy, error, onSubmit }: { busy: boolean; error: unknown; onSubmit: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Frame>
      <div className="stack tight" style={{ alignItems: 'flex-start' }}><Logo size="lg" /><h1 style={{ margin: '8px 0 0' }}>Create your business account</h1>
        <p className="muted" style={{ margin: 0 }}>Bike delivery across your city. Verified businesses only, pay per delivery from a prepaid wallet.</p></div>
      <ErrorBox error={error} />
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...f, acceptTerms: terms }); }}>
        <label>Business name<input required value={f.name ?? ''} onChange={set('name')} /></label>
        <label>Owner name<input required value={f.ownerName ?? ''} onChange={set('ownerName')} /></label>
        <label>Mobile number<input required inputMode="numeric" value={f.phone ?? ''} onChange={set('phone')} placeholder="10 digit mobile" /></label>
        <label>Email<input required type="email" value={f.email ?? ''} onChange={set('email')} /></label>
        <label>Password<input required type="password" minLength={8} value={f.password ?? ''} onChange={set('password')} autoComplete="new-password" /><span className="hint">At least 8 characters</span></label>
        <label className="check"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />I accept the Business Terms: OTP delivery, no time promise, ₹5,000 liability cap, ₹35 per delivery and ₹25 more if a parcel comes back.</label>
        <button className="big" disabled={busy || !terms}>{busy ? 'Sending…' : 'Send OTP'}</button>
      </form>
      <p className="muted" style={{ textAlign: 'center' }}>Already registered? <Link href="/business/login">Log in</Link></p>
    </Frame>
  );
}

function Otp({ me, busy, error, run, done }: { me: any; busy: boolean; error: unknown; run: (fn: () => Promise<unknown>) => void; done: () => void }) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ sentAt?: number; resendAfterSeconds?: number; devPhoneCode?: string; devEmailCode?: string }>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => { try { setSent(JSON.parse(sessionStorage.getItem('tw.signup') || '{}')); } catch { /* ignore */ } const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const wait = Math.max(0, Math.ceil(((sent.sentAt ?? 0) + (sent.resendAfterSeconds ?? 30) * 1000 - now) / 1000));
  const phoneOk = !!me?.phoneVerifiedAt;
  return (
    <Frame step={1}>
      <div><h1 style={{ margin: 0 }}>Enter the codes we sent</h1><p className="muted" style={{ margin: '4px 0 0' }}>No order can be created until both are verified.</p></div>
      <ErrorBox error={error} />
      {(sent.devPhoneCode || sent.devEmailCode) && <div className="alert info"><span>Test mode, no SMS provider yet. Phone code {sent.devPhoneCode} · email code {sent.devEmailCode}</span></div>}
      <div className="stack tight"><b>SMS to +91 {me?.phone}</b>{phoneOk ? <span className="ok-t">✓ Mobile verified</span> : <OtpBoxes value={phone} onChange={setPhone} label="SMS code" />}</div>
      <div className="stack tight"><b>Email to {me?.email}</b><OtpBoxes value={email} onChange={setEmail} label="Email code" /></div>
      <div className="row between small">
        {wait > 0 ? <span className="muted">Resend in 0:{String(wait).padStart(2, '0')}</span>
          : <button className="link" onClick={() => run(async () => { const r = await api('/business/verify-contact/resend', { kind: 'business', body: {} }); const v = { ...r, sentAt: Date.now() }; setSent(v); try { sessionStorage.setItem('tw.signup', JSON.stringify(v)); } catch { /* ignore */ } })}>Resend codes</button>}
        <span className="muted">5 tries, then 15-min lock</span>
      </div>
      <button className="big" disabled={busy || (!phoneOk && phone.length < 6) || email.length < 6} onClick={() => run(async () => { await api('/business/verify-contact', { kind: 'business', body: { phoneCode: phoneOk ? undefined : phone, emailCode: email } }); done(); })}>Verify &amp; continue</button>
    </Frame>
  );
}

function Details({ me, busy, error, run, done }: { me: any; busy: boolean; error: unknown; run: (fn: () => Promise<unknown>) => void; done: () => void }) {
  const existing = me?.addresses?.[0];
  const [f, setF] = useState<Record<string, string>>({ type: me?.type ?? 'INDIVIDUAL', category: me?.category ?? '', instagram: me?.instagram ?? '', website: me?.website ?? '', googleProfile: me?.googleProfile ?? '', address: existing?.address ?? '', pincode: existing?.pincode ?? '' });
  const [pin, setPin] = useState<{ lat?: number; lng?: number }>(existing ? { lat: existing.lat, lng: existing.lng } : {});
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const presence = !!(f.instagram || f.website || f.googleProfile);
  return (
    <Frame step={2}>
      <h1 style={{ margin: 0 }}>Business details</h1>
      <ErrorBox error={error} />
      <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => {
        await api('/business/me', { kind: 'business', method: 'PATCH', body: { type: f.type, category: f.category, instagram: f.instagram || undefined, website: f.website || undefined, googleProfile: f.googleProfile || undefined } });
        const addr = { label: 'Main shop', address: f.address, pincode: f.pincode, lat: pin.lat, lng: pin.lng };
        if (existing) await api(`/business/addresses/${existing.id}`, { kind: 'business', method: 'PATCH', body: { ...addr, isDefault: true } });
        else await api('/business/addresses', { kind: 'business', body: addr });
        done();
      }); }}>
        <label>Business type
          <div className="chips">{TYPES.map(([v, l]) => <button type="button" key={v} className={`chip ${f.type === v ? 'on' : ''}`} onClick={() => setF({ ...f, type: v })}>{l}</button>)}</div>
        </label>
        <label>What you sell<input required value={f.category} onChange={set('category')} placeholder="Clothing, cakes, medicines…" /></label>
        <label>Pickup address<input required value={f.address} onChange={set('address')} placeholder="Shop number, market, area" /></label>
        <div className="row">
          <label style={{ flex: 1 }}>Pincode<input required inputMode="numeric" value={f.pincode} onChange={set('pincode')} /></label>
          <label style={{ flex: 1 }}>City<input value={me?.city?.name ?? ''} disabled /></label>
        </div>
        <LocationInput value={pin} onChange={setPin} label="Pickup pin" />
        <p className="small muted" style={{ margin: 0 }}>The pin must be inside the {me?.city ? `${me.city.radiusKm * 2} km` : '45 km'} service circle.</p>
        <b>Public presence · at least one</b>
        <label>Instagram<input value={f.instagram} onChange={set('instagram')} placeholder="@yourshop" /></label>
        <label>Website<input value={f.website} onChange={set('website')} placeholder="Add link" /></label>
        <label>Google business profile<input value={f.googleProfile} onChange={set('googleProfile')} placeholder="Add link" /></label>
        <button className="big" disabled={busy || !presence || pin.lat == null}>{busy ? 'Saving…' : 'Continue to KYC'}</button>
      </form>
    </Frame>
  );
}

function Kyc({ me, busy, error, run, done, reload }: { me: any; busy: boolean; error: unknown; run: (fn: () => Promise<unknown>) => void; done: () => void; reload: () => Promise<void> }) {
  const [path, setPath] = useState<'express' | 'manual'>(me?.gstin ? 'express' : 'manual');
  const [gstin, setGstin] = useState(me?.gstin ?? '');
  const k = KYC[me?.type ?? 'INDIVIDUAL'] ?? KYC.INDIVIDUAL;
  const has = (kind: string) => me?.documents?.some((d: any) => d.kind === kind);
  const upload = (kind: string, file?: File) => file && run(async () => { const fd = new FormData(); fd.append('kind', kind); fd.append('file', file); await api('/business/documents', { kind: 'business', form: fd }); await reload(); });
  const all = k.docs.every(([kind]) => has(kind)) && has('SELFIE');
  return (
    <Frame step={3}>
      <div><h1 style={{ margin: 0 }}>KYC documents</h1><p className="muted" style={{ margin: '4px 0 0' }}>{k.need}</p></div>
      <ErrorBox error={error} />
      {me?.statusReason && <div className="alert warn"><span>{me.statusReason}</span></div>}
      <div className="grid g2" style={{ gap: 8 }}>
        <button type="button" className={`item ${path === 'express' ? 'on' : ''}`} style={{ textAlign: 'left', borderColor: path === 'express' ? 'var(--teal)' : undefined }} onClick={() => setPath('express')}><b>Express KYC</b><span className="small muted">GSTIN · staff checks in minutes</span></button>
        <button type="button" className="item" style={{ textAlign: 'left', borderColor: path === 'manual' ? 'var(--teal)' : undefined }} onClick={() => setPath('manual')}><b>Manual upload</b><span className="small muted">1–2 days · staff reviews your documents</span></button>
      </div>
      {path === 'express' && (
        <div className="row">
          <label style={{ flex: 1 }}>GSTIN<input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="09ABCPS1234K1Z5" /></label>
          <button className="secondary" style={{ alignSelf: 'flex-end' }} disabled={gstin.length !== 15} onClick={() => run(async () => { await api('/business/me', { kind: 'business', method: 'PATCH', body: { gstin } }); await reload(); })}>{me?.gstin === gstin && gstin ? '✓ Saved' : 'Save'}</button>
        </div>
      )}
      <div className="stack tight">
        <b>Documents</b>
        {k.docs.map(([kind, label]) => (
          <div key={kind} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--soft)' }}>
            <span className="checkrow"><span className={`dot ${has(kind) ? '' : 'todo'}`}>{has(kind) ? '✓' : '+'}</span>{label}</span>
            <label className={`btn ${has(kind) ? 'secondary' : ''}`} style={{ minHeight: 36, fontSize: 13 }}>{has(kind) ? 'Replace' : 'Upload'}<input type="file" hidden accept="image/*,application/pdf" onChange={(e) => upload(kind, e.target.files?.[0])} /></label>
          </div>
        ))}
        <div className="row between" style={{ padding: '8px 0' }}>
          <span className="checkrow"><span className={`dot ${has('SELFIE') ? '' : 'todo'}`}>{has('SELFIE') ? '✓' : '+'}</span>Live selfie</span>
          <label className={`btn ${has('SELFIE') ? 'secondary' : ''}`} style={{ minHeight: 36, fontSize: 13 }}>{has('SELFIE') ? 'Retake' : 'Take selfie'}<input type="file" hidden accept="image/*" capture="user" onChange={(e) => upload('SELFIE', e.target.files?.[0])} /></label>
        </div>
      </div>
      <p className="note">Documents are stored privately and viewed only by verification staff. Aadhaar and bank numbers are masked.</p>
      <button className="big" disabled={busy || !all} onClick={() => run(async () => { await api('/business/submit-for-review', { kind: 'business', body: {} }); done(); })}>Submit for verification</button>
    </Frame>
  );
}

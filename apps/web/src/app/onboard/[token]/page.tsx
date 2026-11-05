'use client';
import { useEffect, useState } from 'react';

/** Driver onboarding web form, opened from the one-time SMS/WhatsApp link. No app install needed. */
const DOCS: [string, string, string][] = [
  ['DL_FRONT', 'Driving Licence (front)', 'ड्राइविंग लाइसेंस (आगे)'], ['DL_BACK', 'Driving Licence (back)', 'ड्राइविंग लाइसेंस (पीछे)'],
  ['RC_FRONT', 'Vehicle RC (front)', 'आरसी (आगे)'], ['RC_BACK', 'Vehicle RC (back)', 'आरसी (पीछे)'],
  ['AADHAAR_FRONT', 'Aadhaar (front)', 'आधार (आगे)'], ['AADHAAR_BACK', 'Aadhaar (back)', 'आधार (पीछे)'],
  ['BANK_PROOF', 'Bank passbook first page or cancelled cheque', 'पासबुक पहला पेज या कैंसल चेक'],
  ['SELFIE', 'Selfie (take it now)', 'सेल्फी (अभी लें)'], ['BIKE_PHOTO', 'Bike photo with number plate', 'नंबर प्लेट के साथ बाइक की फोटो'],
];
const FIELDS: [string, string, string, string?][] = [
  ['name', 'Full name (as on DL)', 'पूरा नाम (DL जैसा)'], ['dob', 'Date of birth', 'जन्म तिथि', 'date'], ['address', 'Address', 'पता'],
  ['emergencyContact', 'Emergency contact phone', 'आपातकालीन संपर्क फोन', 'tel'],
  ['dlNumber', 'DL number', 'DL नंबर'], ['dlExpiry', 'DL valid till', 'DL वैधता', 'date'],
  ['rcNumber', 'RC number', 'RC नंबर'], ['rcExpiry', 'RC valid till', 'RC वैधता', 'date'],
  ['vehicleNumber', 'Vehicle number', 'गाड़ी नंबर'], ['bikeModel', 'Bike model', 'बाइक मॉडल'],
  ['aadhaarNumber', 'Aadhaar number', 'आधार नंबर', 'numeric'],
  ['bankAccountNumber', 'Bank account number', 'बैंक खाता नंबर', 'numeric'], ['ifsc', 'IFSC', 'IFSC'], ['accountHolderName', 'Account holder name', 'खाताधारक का नाम'],
];

export default function Onboard({ params }: { params: { token: string } }) {
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState<string>('');
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<'en' | 'hi'>('hi');
  useEffect(() => {
    fetch(`/api/onboarding/${params.token}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error?.message); setInfo(j); }).catch((e) => setErr(e.message));
  }, [params.token]);
  const L = (en: string, hi: string) => (lang === 'hi' ? `${hi} / ${en}` : en);

  if (done) return <div className="auth"><div className="alert ok"><span>{done}</span></div></div>;
  if (!info) return <div className="auth">{err ? <div className="alert error"><span>{err}</span></div> : <p>Loading…</p>}</div>;
  return (
    <div className="auth" style={{ maxWidth: 640 }}>
      <div className="row between"><h1>{L('Partner signup', 'पार्टनर साइनअप')}</h1><button className="link" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}>{lang === 'en' ? 'हिंदी' : 'English'}</button></div>
      <p className="muted">{info.name} · {info.phoneMasked} · {L('link valid till', 'लिंक वैध')} {new Date(info.expiresAt).toLocaleString()}</p>
      <p className="muted small">{L('₹28 per delivery, ₹20 per return, weekly bank payout, one order at a time, no cash handling. Clear photos only, not photocopies.', '₹28 प्रति डिलीवरी, ₹20 प्रति रिटर्न, हर हफ्ते बैंक में भुगतान, एक बार में एक ऑर्डर, कैश नहीं। साफ फोटो लगाएं, फोटोकॉपी नहीं।')}</p>
      {err && <div className="alert error"><span>{err}</span></div>}
      {problems.length > 1 && <div className="alert error"><ul style={{ margin: 0 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      <form className="card form" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(''); setProblems([]);
        const fd = new FormData(e.currentTarget);
        fd.set('preferredLanguage', lang);
        try {
          const r = await fetch(`/api/onboarding/${params.token}`, { method: 'POST', body: fd });
          const j = await r.json();
          if (!r.ok) { setErr(j.error?.message ?? 'Could not submit'); setProblems(j.error?.details?.problems ?? []); window.scrollTo(0, 0); return; }
          setDone(L(j.message, 'धन्यवाद। हमारी टीम आपके दस्तावेज़ जांचेगी और मंज़ूरी के बाद आपको मैसेज करेगी।'));
        } catch { setErr('Network problem. Please retry.'); } finally { setBusy(false); }
      }}>
        <div className="form two">
          {FIELDS.map(([k, en, hi, type]) => (
            <label key={k}>{L(en, hi)}<input name={k} required type={type === 'date' ? 'date' : type === 'tel' ? 'tel' : 'text'} inputMode={type === 'numeric' ? 'numeric' : undefined} defaultValue={k === 'name' ? info.name : undefined} /></label>
          ))}
          <input type="hidden" name="vehicleType" value="BIKE" />
        </div>
        <h3>{L('Photos', 'फोटो')}</h3>
        <div className="form two">
          {DOCS.map(([k, en, hi]) => (
            <label key={k}>{L(en, hi)}<input name={k} type="file" required accept="image/*,application/pdf" capture={k === 'SELFIE' ? 'user' : undefined} /></label>
          ))}
        </div>
        <button disabled={busy}>{busy ? '…' : L('Submit for verification', 'जांच के लिए भेजें')}</button>
        <p className="muted small">{L('Your documents are private and only seen by our verification team.', 'आपके दस्तावेज़ निजी हैं, सिर्फ हमारी वेरिफिकेशन टीम देखेगी।')}</p>
      </form>
    </div>
  );
}

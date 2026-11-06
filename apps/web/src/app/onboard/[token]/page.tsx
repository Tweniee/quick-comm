'use client';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/ui';

/** O01–O07 · Driver onboarding from the one-time SMS/WhatsApp link. No app install needed. */
type Lang = 'en' | 'hi';
type Step = 'intro' | 'details' | 'docs' | 'selfie' | 'review' | 'done';
const tx = (lang: Lang, en: string, hi: string) => (lang === 'hi' ? hi : en);

const DOC_GROUPS: { title: [string, string]; kinds: [string, string, string][]; note: [string, string] }[] = [
  { title: ['Driving Licence · 2 sides', 'ड्राइविंग लाइसेंस · दोनों तरफ'], kinds: [['DL_FRONT', 'Front', 'आगे'], ['DL_BACK', 'Back', 'पीछे']], note: ['Must be valid for 30+ days', '30+ दिन वैध होना चाहिए'] },
  { title: ['Vehicle RC · 2 sides', 'गाड़ी की RC · दोनों तरफ'], kinds: [['RC_FRONT', 'Front', 'आगे'], ['RC_BACK', 'Back', 'पीछे']], note: ['Number must match your bike', 'नंबर आपकी बाइक से मिलना चाहिए'] },
  { title: ['Aadhaar', 'आधार'], kinds: [['AADHAAR_FRONT', 'Front', 'आगे'], ['AADHAAR_BACK', 'Back', 'पीछे']], note: ['Only the last 4 digits are kept visible', 'सिर्फ आखिरी 4 अंक दिखेंगे'] },
  { title: ['Bank passbook', 'बैंक पासबुक'], kinds: [['BANK_PROOF', 'Passbook page or cancelled cheque', 'पासबुक पेज या कैंसल चेक']], note: ['Name must match the account holder', 'नाम खाताधारक से मिलना चाहिए'] },
  { title: ['Bike photo, plate visible', 'बाइक की फोटो, नंबर प्लेट दिखे'], kinds: [['BIKE_PHOTO', 'Photo', 'फोटो']], note: ['Whole bike with the number plate', 'पूरी बाइक, नंबर प्लेट के साथ'] },
];
const ALL_DOCS = DOC_GROUPS.flatMap((g) => g.kinds.map((k) => k[0]));
const IFSC_OK = (v: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase().trim());

function Top({ lang, setLang, step }: { lang: Lang; setLang: (l: Lang) => void; step?: string }) {
  return (
    <div className="phone-top">
      <span className="row" style={{ gap: 8 }}><Logo /><span className="small">{step ?? 'Tweniee Partner'}</span></span>
      <div className="lang"><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button><button className={lang === 'hi' ? 'on' : ''} onClick={() => setLang('hi')}>हिं</button></div>
    </div>
  );
}

function Selfie({ lang, file, setFile }: { lang: Lang; file?: File; setFile: (f: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);
  const [preview, setPreview] = useState<string>('');
  useEffect(() => { if (file) setPreview(URL.createObjectURL(file)); }, [file]);
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (!file && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then((s) => { stream = s; if (video.current) { video.current.srcObject = s; setLive(true); } }).catch(() => setLive(false));
    }
    return () => stream?.getTracks().forEach((tr) => tr.stop());
  }, [file]);
  const snap = () => {
    const v = video.current; if (!v) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && setFile(new File([b], 'selfie.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9);
  };
  return (
    <div className="stack">
      <div style={{ aspectRatio: '3 / 4', borderRadius: '50% / 40%', overflow: 'hidden', background: 'var(--navy)', maxWidth: 280, width: '100%', alignSelf: 'center' }}>
        {file ? <img src={preview} alt="Your selfie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <video ref={video} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
      </div>
      <div className="checkrow"><span className="dot">✓</span>{tx(lang, 'Good light, no cap or helmet', 'अच्छी रोशनी, टोपी या हेलमेट नहीं')}</div>
      <div className="checkrow"><span className="dot">✓</span>{tx(lang, 'Hold still for 2 seconds', '2 सेकंड स्थिर रहें')}</div>
      {!file && live && <button className="big" onClick={snap}>{tx(lang, 'Take selfie', 'सेल्फी लें')}</button>}
      {!file && !live && <label className="btn big">{tx(lang, 'Open camera', 'कैमरा खोलें')}<input type="file" accept="image/*" capture="user" hidden onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} /></label>}
      {file && <label className="btn secondary">{tx(lang, 'Retake', 'फिर से लें')}<input type="file" accept="image/*" capture="user" hidden onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} /></label>}
    </div>
  );
}

export default function Onboard({ params }: { params: { token: string } }) {
  const [info, setInfo] = useState<any>(null);
  const [expired, setExpired] = useState(false);
  const [lang, setLangState] = useState<Lang>('hi');
  const [step, setStep] = useState<Step>('intro');
  const [f, setF] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [agree, setAgree] = useState({ terms: false, location: false });
  const [err, setErr] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem('tw.lang', l); } catch { /* ignore */ } };
  useEffect(() => {
    try { const l = localStorage.getItem('tw.lang'); if (l === 'en' || l === 'hi') setLangState(l); } catch { /* ignore */ }
    fetch(`/api/onboarding/${params.token}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error?.message); setInfo(j); setF((x) => ({ ...x, name: j.name })); }).catch(() => setExpired(true));
  }, [params.token]);
  const L = (en: string, hi: string) => tx(lang, en, hi);
  const go = (s: Step) => { setStep(s); setErr(''); window.scrollTo(0, 0); };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (expired) return (
    <div className="phone"><Top lang={lang} setLang={setLang} />
      <div className="phone-body">
        <h1>{L('This link no longer works', 'यह लिंक अब काम नहीं करता')}</h1>
        <p>{L('Onboarding links work once and expire after 48 hours. This one was already used, expired, or replaced by a newer link.', 'ऑनबोर्डिंग लिंक एक बार चलता है और 48 घंटे में खत्म हो जाता है। यह लिंक इस्तेमाल हो चुका है, खत्म हो गया है, या नया लिंक भेजा गया है।')}</p>
        <div className="card soft"><b>{L('What to do', 'क्या करें')}</b><p className="small" style={{ margin: '4px 0 0' }}>{L("Ask the Tweniee staff member who signed you up to send a fresh link to your phone. Please don't share links with anyone.", 'जिस Tweniee स्टाफ ने आपको जोड़ा था, उनसे नया लिंक भेजने को कहें। लिंक किसी से शेयर न करें।')}</p></div>
        <a className="btn big secondary" href="tel:+910000000000">{L('Call Tweniee partner support', 'Tweniee पार्टनर सपोर्ट को कॉल करें')}</a>
      </div>
    </div>
  );
  if (!info) return <div className="phone"><Top lang={lang} setLang={setLang} /><div className="phone-body"><p>{L('Loading…', 'लोड हो रहा है…')}</p></div></div>;

  const hoursLeft = Math.max(0, Math.round((new Date(info.expiresAt).getTime() - Date.now()) / 3_600_000));
  const stepLabel = (n: number, en: string, hi: string) => `${L(`Step ${n} of 4`, `चरण ${n} / 4`)} · ${L(en, hi)}`;
  const detailsOk = ['name', 'dob', 'emergencyContact', 'address', 'vehicleNumber', 'bikeModel', 'dlNumber', 'dlExpiry', 'rcNumber', 'rcExpiry', 'aadhaarNumber', 'bankAccountNumber', 'ifsc', 'accountHolderName'].every((k) => f[k]?.trim()) && IFSC_OK(f.ifsc ?? '');
  const docsOk = ALL_DOCS.every((k) => files[k]);
  const age = f.dob ? Math.floor((Date.now() - new Date(f.dob).getTime()) / (365.25 * 86_400_000)) : null;

  const submit = async () => {
    setBusy(true); setErr(''); setProblems([]);
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.set(k, v));
    fd.set('vehicleType', 'BIKE'); fd.set('preferredLanguage', lang);
    Object.entries(files).forEach(([k, file]) => fd.set(k, file));
    try {
      const r = await fetch(`/api/onboarding/${params.token}`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) { setErr(j.error?.message ?? L('Could not submit', 'जमा नहीं हो सका')); setProblems(j.error?.details?.problems ?? []); window.scrollTo(0, 0); return; }
      go('done');
    } catch { setErr(L('Network problem. Please retry.', 'नेटवर्क की दिक्कत। फिर कोशिश करें।')); } finally { setBusy(false); }
  };

  const errors = (err || problems.length > 0) && <div className="alert error" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><span>{err}</span>{problems.length > 1 && <ul style={{ margin: 0 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>}</div>;

  if (step === 'intro') return (
    <div className="phone"><Top lang={lang} setLang={setLang} />
      <div className="phone-body">
        <h1>{L(`${info.name.split(' ')[0]}, finish joining as a delivery partner`, `${info.name.split(' ')[0]}, डिलीवरी पार्टनर बनने के लिए जानकारी भरें`)}</h1>
        <p style={{ margin: 0 }}>{L('No app needed for this step. Takes about 10 minutes.', 'इसके लिए ऐप नहीं चाहिए। लगभग 10 मिनट लगेंगे।')}</p>
        <div className="alert info"><span>{L(`This link works once, for ${info.phoneMasked}`, `यह लिंक एक बार, सिर्फ ${info.phoneMasked} के लिए`)}</span><b>{hoursLeft} h {L('left', 'बाकी')}</b></div>
        <div className="grid g3" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[['₹28', L('per delivery', 'प्रति डिलीवरी')], ['₹20', L('per return', 'प्रति रिटर्न')], [L('Weekly', 'हर हफ्ते'), L('bank payout', 'बैंक भुगतान')]].map(([a, b]) => <div key={b} className="card soft" style={{ textAlign: 'center', padding: 10 }}><b className="navy" style={{ fontSize: 18 }}>{a}</b><div className="tiny muted">{b}</div></div>)}
        </div>
        <div className="card"><b>{L('Keep these ready', 'ये तैयार रखें')}</b>
          <div className="stack tight" style={{ marginTop: 8 }}>
            {[L('Driving Licence, front and back', 'ड्राइविंग लाइसेंस, आगे और पीछे'), L('Vehicle RC, front and back', 'गाड़ी की RC, आगे और पीछे'), L('Aadhaar, front and back', 'आधार, आगे और पीछे'), L('Bank passbook page or cancelled cheque', 'बैंक पासबुक पेज या कैंसल चेक'), L('Your bike, with number plate visible', 'आपकी बाइक, नंबर प्लेट दिखे')].map((s) => <div key={s} className="checkrow"><span className="dot todo">•</span>{s}</div>)}
          </div>
        </div>
        <p className="note">{L('One order at a time. No cash handling. Work when you want.', 'एक बार में एक ऑर्डर। कैश नहीं। जब चाहें तब काम करें।')}</p>
        <button className="big" onClick={() => go('details')}>{L('Start', 'शुरू करें')}</button>
      </div>
    </div>
  );

  if (step === 'details') return (
    <div className="phone"><Top lang={lang} setLang={setLang} step={stepLabel(1, 'Your details', 'आपकी जानकारी')} />
      <div className="phone-body">
        <div className="progress"><i style={{ width: '25%' }} /></div>
        {errors}
        <form className="form" onSubmit={(e) => { e.preventDefault(); if (detailsOk) go('docs'); }}>
          <label>{L('Full name, as on DL', 'पूरा नाम, DL जैसा')}<input required value={f.name ?? ''} onChange={set('name')} /></label>
          <label>{L('Date of birth', 'जन्म तिथि')}<input required type="date" value={f.dob ?? ''} onChange={set('dob')} /></label>
          <label>{L('Emergency contact', 'आपातकालीन संपर्क')}<input required type="tel" inputMode="numeric" value={f.emergencyContact ?? ''} onChange={set('emergencyContact')} /></label>
          <label>{L('Home address', 'घर का पता')}<input required value={f.address ?? ''} onChange={set('address')} /></label>
          <h3>{L('Bike', 'बाइक')}</h3>
          <div className="row"><label style={{ flex: 1 }}>{L('Number', 'नंबर')}<input required value={f.vehicleNumber ?? ''} onChange={set('vehicleNumber')} placeholder="UP78 FK 2042" /></label><label style={{ flex: 1 }}>{L('Model', 'मॉडल')}<input required value={f.bikeModel ?? ''} onChange={set('bikeModel')} placeholder="Splendor" /></label></div>
          <h3>{L('Licence and RC', 'लाइसेंस और RC')}</h3>
          <div className="row"><label style={{ flex: 1 }}>{L('DL number', 'DL नंबर')}<input required value={f.dlNumber ?? ''} onChange={set('dlNumber')} /></label><label style={{ flex: 1 }}>{L('DL valid till', 'DL वैधता')}<input required type="date" value={f.dlExpiry ?? ''} onChange={set('dlExpiry')} /></label></div>
          <div className="row"><label style={{ flex: 1 }}>{L('RC number', 'RC नंबर')}<input required value={f.rcNumber ?? ''} onChange={set('rcNumber')} /></label><label style={{ flex: 1 }}>{L('RC valid till', 'RC वैधता')}<input required type="date" value={f.rcExpiry ?? ''} onChange={set('rcExpiry')} /></label></div>
          <label>{L('Aadhaar number', 'आधार नंबर')}<input required inputMode="numeric" value={f.aadhaarNumber ?? ''} onChange={set('aadhaarNumber')} /></label>
          <h3>{L('Bank for weekly payout', 'हर हफ्ते भुगतान के लिए बैंक')}</h3>
          <label>{L('Account number', 'खाता नंबर')}<input required inputMode="numeric" value={f.bankAccountNumber ?? ''} onChange={set('bankAccountNumber')} /></label>
          <label>IFSC<input required value={f.ifsc ?? ''} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} /></label>
          {f.ifsc && <p className={`small ${IFSC_OK(f.ifsc) ? 'ok-t' : 'bad-t'}`} style={{ margin: 0 }}>{IFSC_OK(f.ifsc) ? L('IFSC format valid', 'IFSC सही है') : L('IFSC looks wrong (e.g. SBIN0001234)', 'IFSC गलत लग रहा है (जैसे SBIN0001234)')}</p>}
          <label>{L('Holder name', 'खाताधारक का नाम')}<input required value={f.accountHolderName ?? ''} onChange={set('accountHolderName')} /></label>
          <button className="big" disabled={!detailsOk}>{L('Next: documents', 'आगे: दस्तावेज़')}</button>
        </form>
      </div>
    </div>
  );

  if (step === 'docs') return (
    <div className="phone"><Top lang={lang} setLang={setLang} step={stepLabel(2, 'Documents', 'दस्तावेज़')} />
      <div className="phone-body">
        <div className="progress"><i style={{ width: '50%' }} /></div>
        <p style={{ margin: 0 }}>{L('Clear photos of the originals. No photocopies.', 'असली दस्तावेज़ की साफ फोटो। फोटोकॉपी नहीं।')}</p>
        {DOC_GROUPS.map((g) => {
          const done = g.kinds.every(([k]) => files[k]);
          return (
            <div key={g.title[0]} className="card stack tight">
              <div className="row between"><b>{L(...g.title)}</b><span className={`dot ${done ? '' : 'todo'}`}>{done ? '✓' : '+'}</span></div>
              <span className="small muted">{done ? L('Added', 'जोड़ा गया') : L(...g.note)}</span>
              <div className="row">
                {g.kinds.map(([k, en, hi]) => (
                  <label key={k} className={`btn ${files[k] ? 'secondary' : ''}`} style={{ flex: 1, fontSize: 14 }}>
                    {files[k] ? `✓ ${L(en, hi)}` : `${L('Add', 'जोड़ें')} · ${L(en, hi)}`}
                    <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => e.target.files?.[0] && setFiles({ ...files, [k]: e.target.files[0] })} />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        <p className="note">{L('DL and RC must be valid for 30+ days. Phone, Aadhaar and DL can be registered only once.', 'DL और RC 30+ दिन वैध होने चाहिए। फोन, आधार और DL सिर्फ एक बार रजिस्टर हो सकते हैं।')}</p>
        <div className="row"><button className="secondary" onClick={() => go('details')}>{L('Back', 'पीछे')}</button><button className="big" style={{ flex: 1, width: 'auto' }} disabled={!docsOk} onClick={() => go('selfie')}>{L('Next: selfie', 'आगे: सेल्फी')}</button></div>
      </div>
    </div>
  );

  if (step === 'selfie') return (
    <div className="phone"><Top lang={lang} setLang={setLang} step={stepLabel(3, 'Live selfie', 'लाइव सेल्फी')} />
      <div className="phone-body">
        <div className="progress"><i style={{ width: '75%' }} /></div>
        <p style={{ margin: 0 }}>{L('Look at the camera. We match this with your DL and Aadhaar photo.', 'कैमरे की ओर देखें। हम इसे आपके DL और आधार की फोटो से मिलाएंगे।')}</p>
        <Selfie lang={lang} file={files.SELFIE} setFile={(file) => setFiles({ ...files, SELFIE: file })} />
        <div className="row"><button className="secondary" onClick={() => go('docs')}>{L('Back', 'पीछे')}</button><button className="big" style={{ flex: 1, width: 'auto' }} disabled={!files.SELFIE} onClick={() => go('review')}>{L('Next: review', 'आगे: जांचें')}</button></div>
      </div>
    </div>
  );

  if (step === 'review') return (
    <div className="phone"><Top lang={lang} setLang={setLang} step={stepLabel(4, 'Review', 'जांचें')} />
      <div className="phone-body">
        <div className="progress"><i style={{ width: '100%' }} /></div>
        {errors}
        <h2 style={{ margin: 0 }}>{L('Check everything once', 'एक बार सब जांच लें')}</h2>
        <dl className="kv card">
          <dt>{L('Name', 'नाम')}</dt><dd>{f.name}</dd>
          <dt>{L('Age check', 'उम्र')}</dt><dd className={age != null && age >= 18 ? 'ok-t' : 'bad-t'}>{age != null && age >= 18 ? L('18+ as per DL', 'DL के अनुसार 18+') : L('Under 18', '18 से कम')}</dd>
          <dt>{L('Bike', 'बाइक')}</dt><dd>{f.vehicleNumber} · {f.bikeModel}</dd>
          <dt>{L('Bank', 'बैंक')}</dt><dd>{f.ifsc?.slice(0, 4)} •••• {f.bankAccountNumber?.slice(-4)}</dd>
          <dt>{L('Documents', 'दस्तावेज़')}</dt><dd>{ALL_DOCS.filter((k) => files[k]).length + (files.SELFIE ? 1 : 0)} {L('of', '/')} {ALL_DOCS.length + 1} {L('added', 'जोड़े')}</dd>
        </dl>
        <label className="check"><input type="checkbox" checked={agree.terms} onChange={(e) => setAgree({ ...agree, terms: e.target.checked })} />{L('I agree to the Partner Agreement and allow Tweniee to store my documents privately for verification.', 'मैं पार्टनर एग्रीमेंट से सहमत हूं और Tweniee को जांच के लिए मेरे दस्तावेज़ निजी रूप से रखने की अनुमति देता हूं।')}</label>
        <label className="check"><input type="checkbox" checked={agree.location} onChange={(e) => setAgree({ ...agree, location: e.target.checked })} />{L("Location is shared only while I'm online or on a job.", 'मेरी लोकेशन सिर्फ ऑनलाइन या काम के दौरान शेयर होगी।')}</label>
        <p className="note">{L('After you submit, this link stops working. A support person checks every partner by hand.', 'जमा करने के बाद यह लिंक बंद हो जाएगा। हर पार्टनर को एक व्यक्ति खुद जांचता है।')}</p>
        <button className="big" disabled={busy || !agree.terms || !agree.location} onClick={submit}>{busy ? '…' : L('Submit for verification', 'जांच के लिए भेजें')}</button>
        <button className="link" onClick={() => go('details')}>{L('Edit details', 'जानकारी बदलें')}</button>
      </div>
    </div>
  );

  return (
    <div className="phone"><Top lang={lang} setLang={setLang} />
      <div className="phone-body">
        <h1>{L('Submitted. Support will check your documents.', 'जमा हो गया। सपोर्ट आपके दस्तावेज़ जांचेगा।')}</h1>
        <p style={{ margin: 0 }}>{L("You can't log in to the Driver App yet. That's on purpose: every partner is approved by a person first.", 'अभी आप ड्राइवर ऐप में लॉग इन नहीं कर सकते। हर पार्टनर को पहले एक व्यक्ति मंज़ूरी देता है।')}</p>
        <ul className="timeline card">
          <li><span><b>{L('Details and documents received', 'जानकारी और दस्तावेज़ मिल गए')}</b></span><span /></li>
          <li className="todo"><span>{L('Support checks selfie, bike and bank name', 'सपोर्ट सेल्फी, बाइक और बैंक नाम जांचेगा')}</span><span /></li>
          <li className="todo"><span>{L('SMS + WhatsApp: "Approved, download the app"', 'SMS + WhatsApp: "मंज़ूर, ऐप डाउनलोड करें"')}</span><span /></li>
        </ul>
        <p className="note">{L('If a photo is unclear, support will ask you to re-upload just that one.', 'अगर कोई फोटो साफ नहीं है, तो सपोर्ट सिर्फ वही दोबारा मांगेगा।')}</p>
        <button className="big secondary" disabled>{L('After approval: get the Driver App', 'मंज़ूरी के बाद: ड्राइवर ऐप लें')}</button>
      </div>
    </div>
  );
}

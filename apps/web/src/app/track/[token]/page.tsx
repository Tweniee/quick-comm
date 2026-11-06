'use client';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/ui';
import { tm } from '@/lib/api';
import { mapsLink } from '@/lib/geo';

/** T01–T05 · Customer tracking: link only, no login, light enough for 2G. English + Hindi. */
type Lang = 'en' | 'hi';
const S = {
  en: {
    by: 'Delivery by Tweniee', from: (b: string) => `Your parcel from ${b}`, otp: 'YOUR DELIVERY OTP', otpWarn: 'Share this only when you have the parcel in your hand.',
    steps: ['Packed', 'Rider assigned', 'Picked up · live map starts', 'On the way', 'Delivered'],
    packed: ['Packed', 'Your parcel is packed. A rider is being found.'],
    assigned: (r: string) => ['Rider assigned', `${r} is going to the shop to pick it up.`],
    onWay: (r: string, km: number | null) => ['On the way to you', km != null ? `${r} is ${km} km away.` : `${r} has your parcel.`],
    arrived: (r: string, at: string) => [`${r} has arrived`, `${r === 'Rider' ? 'The rider' : 'He'}'s at ${at} and will wait up to 15 minutes. Please come to the door.`],
    doorSteps: (r: string) => ['Take the parcel', 'Check the seal', `Then tell ${r} the OTP`],
    pickedAt: (t: string) => `Picked up at ${t}`, call: (r: string) => `Call ${r}`, callShort: 'Call', map: 'See on map',
    delivered: 'Delivered', deliveredAt: (b: string, t: string) => `Your parcel from ${b} was handed over at ${t}.`, deliveredBy: 'Delivered by', confirmed: 'Confirmed with', yourOtp: 'Your OTP',
    noLonger: "This link no longer shows the rider's location or phone.", wrongItem: (b: string) => `Something wrong with the item? Contact ${b}:`,
    returned: "We couldn't reach you", returnedBody: (r: string, w: number | null, c: number, b: string) => `${r} waited ${w ?? 15} minutes and called ${c} time${c === 1 ? '' : 's'}. The parcel is going back to ${b}.`,
    arrivedLbl: 'Arrived', waited: 'Waited', status: 'Status', still: 'Still want it?', stillBody: 'Call the shop to arrange a new delivery. This OTP no longer works.', callShop: (b: string) => `Call ${b}`,
    questions: (b: string) => `Questions about your order? Call ${b}:`, cancelled: 'This order was cancelled', notfound: 'This tracking link is not valid.', loading: 'Loading…', min: 'min',
  },
  hi: {
    by: 'Tweniee द्वारा डिलीवरी', from: (b: string) => `${b} से आपका पार्सल`, otp: 'आपका डिलीवरी OTP', otpWarn: 'OTP तभी बताएं जब पार्सल आपके हाथ में हो।',
    steps: ['पैक हुआ', 'राइडर तय', 'पिकअप · लाइव मैप शुरू', 'रास्ते में', 'डिलीवर हुआ'],
    packed: ['पैक हुआ', 'आपका पार्सल पैक है। राइडर ढूंढा जा रहा है।'],
    assigned: (r: string) => ['राइडर तय', `${r} पार्सल लेने दुकान जा रहे हैं।`],
    onWay: (r: string, km: number | null) => ['आपकी ओर आ रहे हैं', km != null ? `${r} ${km} km दूर हैं।` : `${r} के पास आपका पार्सल है।`],
    arrived: (r: string, at: string) => [`${r} पहुंच गए`, `वे ${at} पर हैं और 15 मिनट तक रुकेंगे। कृपया दरवाज़े पर आएं।`],
    doorSteps: (r: string) => ['पार्सल लें', 'सील जांचें', `फिर ${r} को OTP बताएं`],
    pickedAt: (t: string) => `${t} पर पिकअप`, call: (r: string) => `${r} को कॉल करें`, callShort: 'कॉल', map: 'मैप पर देखें',
    delivered: 'डिलीवर हुआ', deliveredAt: (b: string, t: string) => `${b} का पार्सल ${t} पर दिया गया।`, deliveredBy: 'डिलीवर किया', confirmed: 'पुष्टि', yourOtp: 'आपके OTP से',
    noLonger: 'यह लिंक अब राइडर की लोकेशन या फोन नहीं दिखाता।', wrongItem: (b: string) => `सामान में कोई दिक्कत? ${b} से संपर्क करें:`,
    returned: 'हम आप तक नहीं पहुंच सके', returnedBody: (r: string, w: number | null, c: number, b: string) => `${r} ने ${w ?? 15} मिनट इंतज़ार किया और ${c} बार कॉल किया। पार्सल ${b} को वापस जा रहा है।`,
    arrivedLbl: 'पहुंचे', waited: 'इंतज़ार', status: 'स्थिति', still: 'अब भी चाहिए?', stillBody: 'नई डिलीवरी के लिए दुकान को कॉल करें। यह OTP अब काम नहीं करेगा।', callShop: (b: string) => `${b} को कॉल करें`,
    questions: (b: string) => `ऑर्डर के बारे में सवाल? ${b} को कॉल करें:`, cancelled: 'यह ऑर्डर रद्द हो गया', notfound: 'यह ट्रैकिंग लिंक मान्य नहीं है।', loading: 'लोड हो रहा है…', min: 'मिनट',
  },
};
const STEP: Record<string, number> = { CREATED: 0, READY: 0, ASSIGNING: 0, NO_RIDER: 0, ASSIGNED: 1, PICKED_UP: 2, OUT_FOR_DELIVERY: 3, ARRIVED: 3, DELIVERED: 4 };

function Otp({ otp, t, compact }: { otp: string; t: typeof S.en; compact?: boolean }) {
  return (
    <div className="card navy" style={{ textAlign: 'center' }}>
      <div className="small" style={{ letterSpacing: '.08em', color: '#CBD5E1' }}>{t.otp}</div>
      <div className="otp-big" style={{ color: '#fff', fontSize: compact ? 36 : 48 }}>{otp}</div>
      <div className="small" style={{ color: '#FDE68A' }}>{t.otpWarn}</div>
    </div>
  );
}

export default function Track({ params }: { params: { token: string } }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => {
    try { const l = localStorage.getItem('tw.lang'); if (l === 'hi' || l === 'en') setLang(l); } catch { /* ignore */ }
    let alive = true;
    const load = () => fetch(`/api/track/${params.token}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((x) => alive && setD(x)).catch(() => alive && setErr(true));
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [params.token]);
  const pick = (l: Lang) => { setLang(l); try { localStorage.setItem('tw.lang', l); } catch { /* ignore */ } };
  const t = S[lang];
  const top = (
    <div className="phone-top">
      <span className="row" style={{ gap: 8 }}><Logo /><span className="small">{t.by}</span></span>
      <div className="lang"><button className={lang === 'en' ? 'on' : ''} onClick={() => pick('en')}>EN</button><button className={lang === 'hi' ? 'on' : ''} onClick={() => pick('hi')}>हिं</button></div>
    </div>
  );
  if (!d) return <div className="phone">{top}<div className="phone-body"><p>{err ? t.notfound : t.loading}</p></div></div>;
  const b = d.businessName ?? '';
  const rider = d.rider?.firstName ?? d.returnInfo?.riderFirstName ?? d.deliveredBy ?? 'Rider';
  const shopLine = d.businessPhone && (
    <p className="small muted" style={{ margin: 0 }}>{t.questions(b)} <a href={`tel:${d.businessPhone}`}>{d.businessPhone}</a></p>
  );
  const steps = (
    <ul className="timeline card">
      {t.steps.map((s, i) => <li key={s} className={i <= (STEP[d.status] ?? -1) ? '' : 'todo'}><span>{i <= (STEP[d.status] ?? -1) ? <b>{s}</b> : s}</span><span /></li>)}
    </ul>
  );
  const riderCard = d.rider && (
    <div className="card row between">
      <span className="row"><span className="avatar">{d.rider.initial}</span><span><b>{d.rider.firstName}</b><div className="small muted">{d.times?.pickedUpAt && ['OUT_FOR_DELIVERY', 'PICKED_UP', 'ARRIVED'].includes(d.status) ? t.pickedAt(tm(d.times.pickedUpAt)) : `Bike · ${d.rider.phoneMasked}`}</div></span></span>
      <span className="row">
        {d.riderLocation && <a className="btn secondary" href={mapsLink(d.riderLocation.lat, d.riderLocation.lng)} target="_blank" rel="noreferrer">{t.map}</a>}
        {d.rider.callPhone && d.status !== 'ARRIVED' && <a className="btn" href={`tel:${d.rider.callPhone}`}>{t.callShort}</a>}
      </span>
    </div>
  );

  let body;
  if (d.status === 'DELIVERED') {
    body = (<>
      <div className="hero" style={{ background: 'var(--ok-bg)', color: 'var(--ink)' }}><h1 style={{ color: 'var(--ok)', margin: 0 }}>✓ {t.delivered}</h1><p style={{ margin: 0 }}>{t.deliveredAt(b, tm(d.times?.deliveredAt))}</p></div>
      <dl className="kv card"><dt>{t.deliveredBy}</dt><dd>{d.deliveredBy ?? '—'}</dd><dt>{t.confirmed}</dt><dd>{t.yourOtp}</dd></dl>
      <p className="note">{t.noLonger}</p>
      {d.businessPhone && <p className="small muted">{t.wrongItem(b)} <a href={`tel:${d.businessPhone}`}>{d.businessPhone}</a></p>}
    </>);
  } else if (d.returnInfo) {
    const ri = d.returnInfo;
    body = (<>
      <p className="muted small" style={{ margin: 0 }}>{t.from(b)}</p>
      <div className="alert warn" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><b style={{ fontSize: 18 }}>{t.returned}</b><span>{t.returnedBody(ri.riderFirstName ?? rider, ri.waitedMinutes, ri.calls ?? 0, b)}</span></div>
      <dl className="kv card"><dt>{t.arrivedLbl}</dt><dd>{tm(ri.arrivedAt)}</dd><dt>{t.waited}</dt><dd>{ri.waitedMinutes ?? '—'} {t.min}</dd><dt>{t.status}</dt><dd><span className={`badge s-${d.status}`}>{d.statusText}</span></dd></dl>
      <div className="card soft"><b>{t.still}</b><p className="small" style={{ margin: '4px 0 0' }}>{t.stillBody}</p></div>
      {d.businessPhone && <a className="btn big" href={`tel:${d.businessPhone}`}>{t.callShop(b)}</a>}
    </>);
  } else if (d.status === 'CANCELLED') {
    body = (<><p className="muted small" style={{ margin: 0 }}>{t.from(b)}</p><div className="alert info"><b>{t.cancelled}</b></div>{shopLine}</>);
  } else if (d.status === 'ARRIVED') {
    const [h, p] = t.arrived(rider, d.dropArea ?? '');
    body = (<>
      <p className="muted small" style={{ margin: 0 }}>{t.from(b)}</p>
      <div><h2 style={{ margin: 0 }}>{h}</h2><p style={{ margin: '4px 0 0' }}>{p}</p></div>
      <ol className="card stack tight" style={{ margin: 0, paddingLeft: 32 }}>{t.doorSteps(rider).map((s) => <li key={s}><b>{s}</b></li>)}</ol>
      {d.otp && <Otp otp={d.otp} t={t} />}
      {d.rider?.callPhone && <a className="btn big secondary" href={`tel:${d.rider.callPhone}`}>{t.call(rider)}</a>}
    </>);
  } else {
    const [h, p] = d.status === 'OUT_FOR_DELIVERY' || d.status === 'PICKED_UP' ? t.onWay(rider, d.riderDistanceKm) : d.status === 'ASSIGNED' ? t.assigned(rider) : t.packed;
    body = (<>
      <p className="muted small" style={{ margin: 0 }}>{t.from(b)}</p>
      <div><h2 style={{ margin: 0 }}>{h}</h2><p style={{ margin: '4px 0 0' }}>{p}</p></div>
      {d.otp && <Otp otp={d.otp} t={t} compact={d.status !== 'ASSIGNED'} />}
      {riderCard}
      {steps}
      {shopLine}
    </>);
  }
  return <div className="phone">{top}<div className="phone-body">{body}<p className="tiny muted" style={{ marginTop: 'auto' }}>{d.code} · {tm(d.updatedAt)}</p></div></div>;
}

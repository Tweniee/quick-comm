'use client';
import { useEffect, useState } from 'react';
import { mapsLink } from '@/lib/geo';

/** Customer tracking: link only, no login, light enough for 2G. English + Hindi. */
const T = {
  en: { from: 'Your parcel from', otp: 'Delivery OTP', warn: 'Share this OTP only when you have the parcel in your hand.', rider: 'Rider', live: 'See rider on map', updated: 'Updated', help: 'Questions? Call', notfound: 'This tracking link is not valid.', loading: 'Loading…', steps: ['Packed', 'Rider assigned', 'Picked up', 'On the way', 'Arrived', 'Delivered'] },
  hi: { from: 'आपका पार्सल', otp: 'डिलीवरी OTP', warn: 'OTP तभी बताएं जब पार्सल आपके हाथ में हो।', rider: 'राइडर', live: 'राइडर को मैप पर देखें', updated: 'अपडेट', help: 'सवाल? कॉल करें', notfound: 'यह ट्रैकिंग लिंक मान्य नहीं है।', loading: 'लोड हो रहा है…', steps: ['पैक हुआ', 'राइडर तय', 'पिकअप हुआ', 'रास्ते में', 'पहुंच गया', 'डिलीवर हुआ'] },
};
const STEP_INDEX: Record<string, number> = { READY: 0, ASSIGNING: 0, NO_RIDER: 0, ASSIGNED: 1, PICKED_UP: 2, OUT_FOR_DELIVERY: 3, ARRIVED: 4, DELIVERED: 5 };
const HI_STATUS: Record<string, string> = { 'Order received': 'ऑर्डर मिला', Packed: 'पैक हुआ', 'Rider assigned': 'राइडर तय', 'Picked up': 'पिकअप हुआ', 'On the way': 'रास्ते में', 'Rider has arrived': 'राइडर पहुंच गया', Delivered: 'डिलीवर हुआ', 'Could not be delivered': 'डिलीवर नहीं हो सका', 'Returning to sender': 'वापस भेजा जा रहा है', 'Returned to sender': 'वापस भेज दिया', Cancelled: 'रद्द' };

export default function Track({ params }: { params: { token: string } }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/track/${params.token}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((x) => alive && setD(x)).catch(() => alive && setErr(true));
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [params.token]);
  const t = T[lang];
  if (err && !d) return <div className="auth"><p>{t.notfound}</p></div>;
  if (!d) return <div className="auth"><p>{t.loading}</p></div>;
  const step = STEP_INDEX[d.status] ?? -1;
  return (
    <div className="auth" style={{ maxWidth: 480 }}>
      <div className="row between"><span className="muted small">{t.from}</span><button className="link" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}>{lang === 'en' ? 'हिंदी' : 'English'}</button></div>
      <h1 style={{ marginBottom: 4 }}>{d.businessName}</h1>
      <h2 style={{ color: 'var(--brand)' }}>{lang === 'hi' ? HI_STATUS[d.statusText] ?? d.statusText : d.statusText}</h2>
      {d.otp && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="muted">{t.otp}</div>
          <div className="mono" style={{ fontSize: 44, fontWeight: 800, letterSpacing: 8 }}>{d.otp}</div>
          <div className="alert warn" style={{ justifyContent: 'center', marginBottom: 0 }}>{t.warn}</div>
        </div>
      )}
      {step >= 0 && (
        <ol className="timeline card" style={{ paddingLeft: 16 }}>
          {t.steps.map((s, i) => <li key={s} style={{ opacity: i <= step ? 1 : 0.4 }}>{i <= step ? <b>{s}</b> : s}</li>)}
        </ol>
      )}
      {d.rider && (
        <div className="card">
          <div>{t.rider}: <b>{d.rider.firstName}</b> <span className="muted">{d.rider.phoneMasked}</span></div>
          {d.riderLocation && <a className="btn secondary" style={{ marginTop: 8 }} href={mapsLink(d.riderLocation.lat, d.riderLocation.lng)} target="_blank" rel="noreferrer">{t.live}</a>}
        </div>
      )}
      <p className="muted small">{t.updated} {new Date(d.updatedAt).toLocaleTimeString()} · {d.code}{d.businessPhone && <> · {t.help} <a href={`tel:${d.businessPhone}`}>{d.businessName}</a></>}</p>
    </div>
  );
}

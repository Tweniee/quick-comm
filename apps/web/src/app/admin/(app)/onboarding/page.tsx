'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, Chips, ErrorBox, PageHead, usePoll } from '@/components/ui';
import { api } from '@/lib/api';

const SOURCES = ['Swiggy', 'Zomato', 'Instamart', 'Referral', 'Other'] as const;

/** A09 · Driver onboarding: start a driver and track their one-time link. */
export default function Onboarding() {
  const list = usePoll(() => api('/admin/views/onboarding', { kind: 'admin' }), 20000);
  const [cities, setCities] = useState<any[]>([]);
  const [f, setF] = useState({ name: '', phone: '', cityId: '', source: 'Swiggy' });
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  useEffect(() => { api('/admin/cities', { kind: 'admin' }).then((c) => { setCities(c); if (c[0]) setF((x) => ({ ...x, cityId: c[0].id })); }).catch(setError); }, []);
  const run = async (fn: () => Promise<unknown>, msg: string) => { setError(null); setOk(''); try { await fn(); setOk(msg); await list.reload(); } catch (e) { setError(e); } };
  return (
    <>
      <PageHead title="Driver onboarding" />
      <ErrorBox error={error || list.error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      <div className="grid g2" style={{ alignItems: 'start', gridTemplateColumns: 'minmax(280px, 380px) 1fr' }}>
        <Card title="Start a new driver">
          <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/admin/drivers/invite', { kind: 'admin', body: f }); setF({ ...f, name: '', phone: '' }); }, 'Link sent by SMS and WhatsApp'); }}>
            <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label>Phone<input required inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="10 digit mobile" /></label>
            <label>City<select value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value })}>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Source<Chips value={f.source} onChange={(v) => setF({ ...f, source: v })} options={SOURCES.map((s) => ({ value: s, label: s }))} /></label>
            <button className="big">Send one-time link · SMS + WhatsApp</button>
            <p className="note">Link works once, for this phone only, and expires in 48 h (reminder at 24 h). Sending a new link kills the old one.</p>
          </form>
        </Card>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Driver</th><th>Source</th><th>Link</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(list.data ?? []).map((d: any) => (
                <tr key={d.id}>
                  <td><b>{d.name}</b><div className="mono small muted">{d.phoneMasked}</div></td>
                  <td>{d.source ?? '—'}</td>
                  <td className="small">{d.link}</td>
                  <td className="small">{d.state}</td>
                  <td>
                    {d.canReview && <Link href={`/admin/drivers/${d.id}`}>Review ›</Link>}
                    {!d.canReview && d.needsLink && <button className="link" onClick={() => run(() => api(`/admin/drivers/${d.id}/send-link`, { kind: 'admin', body: {} }), 'Fresh link sent. The old one no longer works.')}>Send fresh link</button>}
                    {!d.canReview && !d.needsLink && <Link href={`/admin/drivers/${d.id}`}>Open</Link>}
                  </td>
                </tr>
              ))}
              {list.data && !list.data.length && <tr><td colSpan={5} className="muted">No drivers in onboarding.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

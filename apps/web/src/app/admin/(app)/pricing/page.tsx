'use client';
import { useEffect, useState } from 'react';
import { Card, ErrorBox, PageHead, usePoll } from '@/components/ui';
import { api, dateOnly, rupees } from '@/lib/api';

/** A13 · Pricing (Super Admin). Price is a setting, never a formula. */
export default function Pricing() {
  const cities = usePoll(() => api('/admin/cities', { kind: 'admin' }), 60000);
  const [cityId, setCityId] = useState('');
  useEffect(() => { if (!cityId && cities.data?.[0]) setCityId(cities.data[0].id); }, [cities.data, cityId]);
  const hist = usePoll(() => (cityId ? api(`/admin/cities/${cityId}/pricing`, { kind: 'admin' }) : Promise.resolve([])), 60000, [cityId]);
  const current = (hist.data ?? []).find((x: any) => !x.effectiveTo && new Date(x.effectiveFrom) <= new Date()) ?? hist.data?.[0];
  const [f, setF] = useState({ delivery: '', ret: '', from: '', reason: '' });
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  useEffect(() => { if (current) setF((x) => ({ ...x, delivery: x.delivery || String(current.deliveryFee / 100), ret: x.ret || String(current.returnFee / 100) })); }, [current]);
  const share = current?.driverSharePct ?? 80;
  const del = Math.round(Number(f.delivery || 0) * 100), ret = Math.round(Number(f.ret || 0) * 100);
  const split = (amt: number) => { const rider = Math.round((amt * share) / 100); return [rider, amt - rider]; };
  const city = cities.data?.find((c: any) => c.id === cityId);
  return (
    <>
      <PageHead title={`Pricing${city ? ` · ${city.name}` : ''}`} sub="Super Admin only. Changes apply to new orders from the effective time, never to orders already created." right={cities.data?.length > 1 && <select value={cityId} onChange={(e) => setCityId(e.target.value)} style={{ width: 200 }}>{cities.data.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>} />
      <ErrorBox error={error || cities.error || hist.error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title={<>Current price {current && <span className="muted small">· {rupees(current.deliveryFee)} / {rupees(current.returnFee)}</span>}</>}>
          <form className="form" onSubmit={async (e) => {
            e.preventDefault(); setError(null); setOk('');
            if (!confirm('The new price applies only to orders created after the effective time. Continue?')) return;
            try {
              await api(`/admin/cities/${cityId}/pricing`, { kind: 'admin', body: { deliveryFee: del, returnFee: ret, driverSharePct: share, effectiveFrom: f.from ? new Date(f.from).toISOString() : undefined, reason: f.reason } });
              setOk('New price saved'); await hist.reload();
            } catch (err) { setError(err); }
          }}>
            <div className="row">
              <label style={{ flex: 1 }}>Delivery fee (₹)<input required type="number" min="1" value={f.delivery} onChange={(e) => setF({ ...f, delivery: e.target.value })} /></label>
              <label style={{ flex: 1 }}>Return fee (₹)<input required type="number" min="0" value={f.ret} onChange={(e) => setF({ ...f, ret: e.target.value })} /></label>
            </div>
            <label>Effective from<input type="datetime-local" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
            <label>Reason (audit log)<input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
            <button>Save new price</button>
            <p className="note">A new fee must be announced 30 days ahead and shown before order creation.</p>
          </form>
        </Card>
        <Card title={`Split preview · rider ${share}% / platform ${100 - share}%`}>
          <table>
            <thead><tr><th>Case</th><th>Charged</th><th>Rider</th><th>Platform</th></tr></thead>
            <tbody>
              {[['Delivered', del], ['Return', ret], ['Undelivered', del + ret]].map(([label, amt]) => {
                const [r, p] = split(amt as number);
                return <tr key={label as string}><td>{label}</td><td>{rupees(amt as number)}</td><td>{rupees(r)}</td><td>{rupees(p)}</td></tr>;
              })}
            </tbody>
          </table>
          <p className="note">The {share}/{100 - share} split is still marked TO CONFIRM in the masterplan. The ₹{(del + ret) / 100} undelivered total is held when a rider accepts; ₹{ret / 100} goes back on delivery.</p>
        </Card>
      </div>
      <Card title="History">
        {(hist.data ?? []).map((x: any) => (
          <div key={x.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--soft)' }}>
            <span><b>{rupees(x.deliveryFee)} / {rupees(x.returnFee)}</b>{x.reason ? ` · ${x.reason}` : ''}<div className="small muted">Set by {x.setByName ?? 'system'} · from {dateOnly(x.effectiveFrom)}{x.effectiveTo ? ` to ${dateOnly(x.effectiveTo)}` : ''}</div></span>
            {x === current && <span className="badge s-ACTIVE">In force</span>}
          </div>
        ))}
        <p className="note">Distance and weight slabs: built, off until Phase 4.</p>
      </Card>
    </>
  );
}

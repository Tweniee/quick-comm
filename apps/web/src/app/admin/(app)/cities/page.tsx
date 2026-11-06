'use client';
import { useState } from 'react';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, dt, rupees } from '@/lib/api';

function CityCard({ c, reload }: { c: any; reload: () => void }) {
  const pricing = usePoll(() => api(`/admin/cities/${c.id}/pricing`, { kind: 'admin' }), 60000, [c.id]);
  const [p, setP] = useState<Record<string, string>>({ deliveryFee: '35', returnFee: '25', driverSharePct: '80' });
  const [error, setError] = useState<unknown>(null);
  const [radius, setRadius] = useState(String(c.radiusKm));
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); reload(); await pricing.reload(); } catch (e) { setError(e); } };
  const current = pricing.data?.find((x: any) => !x.effectiveTo && new Date(x.effectiveFrom) <= new Date()) ?? pricing.data?.[0];
  return (
    <Card title={<>{c.name} <StatusBadge status={c.status} /></>} right={
      c.status === 'ACTIVE'
        ? <button className="danger" onClick={() => { const m = prompt('Message to businesses (e.g. "Deliveries paused for heavy rain, will resume at 6 pm")'); if (m) run(() => api(`/admin/cities/${c.id}/pause`, { kind: 'admin', body: { paused: true, message: m } })); }}>Pause city</button>
        : <button onClick={() => run(() => api(`/admin/cities/${c.id}/pause`, { kind: 'admin', body: { paused: false } }))}>Resume city</button>
    }>
      <ErrorBox error={error} />
      {c.pauseMessage && <div className="alert warn"><span>{c.pauseMessage}</span></div>}
      <p className="small">Centre {c.centerLat}, {c.centerLng} · radius {c.radiusKm} km ({c.radiusKm * 2} km diameter) · hours {c.opensAt}–{c.closesAt}</p>
      <div className="row">
        <input style={{ width: 100 }} type="number" step="0.5" value={radius} onChange={(e) => setRadius(e.target.value)} />
        <button className="secondary" onClick={() => run(() => api(`/admin/cities/${c.id}`, { kind: 'admin', method: 'PATCH', body: { radiusKm: Number(radius) } }))}>Update radius</button>
      </div>
      <h3 style={{ marginTop: 12 }}>Price in force: {rupees(current?.deliveryFee)} delivery / {rupees(current?.returnFee)} return · rider {current?.driverSharePct}%</h3>
      <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (confirm('New price applies only to orders created after the effective time. Continue?')) run(() => api(`/admin/cities/${c.id}/pricing`, { kind: 'admin', body: { deliveryFee: Math.round(Number(p.deliveryFee) * 100), returnFee: Math.round(Number(p.returnFee) * 100), driverSharePct: Number(p.driverSharePct), effectiveFrom: p.effectiveFrom || undefined } })); }}>
        <label style={{ width: 110 }}>Delivery ₹<input value={p.deliveryFee} onChange={(e) => setP({ ...p, deliveryFee: e.target.value })} /></label>
        <label style={{ width: 110 }}>Return ₹<input value={p.returnFee} onChange={(e) => setP({ ...p, returnFee: e.target.value })} /></label>
        <label style={{ width: 110 }}>Rider %<input value={p.driverSharePct} onChange={(e) => setP({ ...p, driverSharePct: e.target.value })} /></label>
        <label style={{ width: 220 }}>Effective from<input type="datetime-local" onChange={(e) => setP({ ...p, effectiveFrom: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></label>
        <button>Set price</button>
      </form>
      <table style={{ marginTop: 12 }}><thead><tr><th>From</th><th>To</th><th>Delivery</th><th>Return</th><th>Rider</th></tr></thead>
        <tbody>{(pricing.data ?? []).map((x: any) => <tr key={x.id}><td className="small">{dt(x.effectiveFrom)}</td><td className="small">{dt(x.effectiveTo)}</td><td>{rupees(x.deliveryFee)}</td><td>{rupees(x.returnFee)}</td><td>{x.driverSharePct}%</td></tr>)}</tbody></table>
    </Card>
  );
}

export default function Cities() {
  const list = usePoll(() => api('/admin/cities', { kind: 'admin' }), 60000);
  const [f, setF] = useState<Record<string, string>>({ radiusKm: '22.5' });
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <h1>Cities & pricing</h1>
      <p className="muted">Super Admin only. Price is a setting, not a formula. Changes never affect orders already created.</p>
      <ErrorBox error={error || list.error} />
      {(list.data ?? []).map((c: any) => <CityCard key={c.id} c={c} reload={list.reload} />)}
      <Card title="Add city">
        <form className="row" onSubmit={async (e) => { e.preventDefault(); setError(null); try { await api('/admin/cities', { kind: 'admin', body: { name: f.name, centerLat: Number(f.lat), centerLng: Number(f.lng), radiusKm: Number(f.radiusKm) } }); await list.reload(); } catch (err) { setError(err); } }}>
          <input required placeholder="Name" style={{ width: 160 }} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input required placeholder="Centre lat" style={{ width: 120 }} onChange={(e) => setF({ ...f, lat: e.target.value })} />
          <input required placeholder="Centre lng" style={{ width: 120 }} onChange={(e) => setF({ ...f, lng: e.target.value })} />
          <input placeholder="Radius km" style={{ width: 100 }} value={f.radiusKm} onChange={(e) => setF({ ...f, radiusKm: e.target.value })} />
          <button>Add city</button>
        </form>
        <p className="muted small">Then set its price above. Orders cannot be created in a city with no price.</p>
      </Card>
    </>
  );
}

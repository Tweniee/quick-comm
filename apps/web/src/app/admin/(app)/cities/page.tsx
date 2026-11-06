'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, ErrorBox, PageHead, StatusBadge, usePoll } from '@/components/ui';
import { api } from '@/lib/api';
import { mapsLink } from '@/lib/geo';

function CityCard({ c, reload }: { c: any; reload: () => Promise<void> }) {
  const [f, setF] = useState({ diameter: String(c.radiusKm * 2), opensAt: c.opensAt ?? '08:00', closesAt: c.closesAt ?? '22:00' });
  const [msg, setMsg] = useState(c.pauseMessage ?? '');
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const run = async (fn: () => Promise<unknown>, m: string) => { setError(null); setOk(''); try { await fn(); setOk(m); await reload(); } catch (e) { setError(e); } };
  const dia = Number(f.diameter);
  const active = c.status === 'ACTIVE';
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Card title={<>{c.name} <StatusBadge status={c.status} /></>}>
        <ErrorBox error={error} />
        {ok && <div className="alert ok"><span>{ok}</span></div>}
        <form className="form" onSubmit={(e) => { e.preventDefault(); run(() => api(`/admin/cities/${c.id}`, { kind: 'admin', method: 'PATCH', body: { radiusKm: dia / 2, opensAt: f.opensAt, closesAt: f.closesAt } }), 'City updated'); }}>
          <p className="small" style={{ margin: 0 }}>Centre pin <a href={mapsLink(c.centerLat, c.centerLng)} target="_blank" rel="noreferrer">{c.centerLat.toFixed(4)}, {c.centerLng.toFixed(4)}</a> · radius {c.radiusKm} km ({c.radiusKm * 2} km diameter)</p>
          <label>Diameter (40–45 km)<input type="number" step="0.5" min="40" max="45" value={f.diameter} onChange={(e) => setF({ ...f, diameter: e.target.value })} /></label>
          <div className="row">
            <label style={{ flex: 1 }}>Opens<input type="time" value={f.opensAt} onChange={(e) => setF({ ...f, opensAt: e.target.value })} /></label>
            <label style={{ flex: 1 }}>Closes<input type="time" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} /></label>
          </div>
          <button className="secondary" disabled={dia < 40 || dia > 45}>Save</button>
          <p className="note">Pickup or drop outside the circle: the order can&apos;t be created.</p>
        </form>
      </Card>
      <Card title={active ? 'Pause deliveries' : 'Deliveries paused'}>
        <div className="form">
          <label>Message to businesses<textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Deliveries paused for heavy rain, back at 6 pm" disabled={!active} /></label>
          <p className="note">New orders stop. Orders already picked up finish delivery or return.</p>
          {active
            ? <button className="danger solid" disabled={!msg.trim()} onClick={() => confirm(`Pause ${c.name} now? New orders stop at once.`) && run(() => api(`/admin/cities/${c.id}/pause`, { kind: 'admin', body: { paused: true, message: msg } }), 'City paused')}>Pause {c.name} now</button>
            : <button onClick={() => run(() => api(`/admin/cities/${c.id}/pause`, { kind: 'admin', body: { paused: false } }), 'Deliveries resumed')}>Resume {c.name}</button>}
          <Link href="/admin/pricing" className="small">Price for {c.name} ›</Link>
        </div>
      </Card>
    </div>
  );
}

/** A14 · Cities (Super Admin). */
export default function Cities() {
  const list = usePoll(() => api('/admin/cities', { kind: 'admin' }), 60000);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<Record<string, string>>({ diameter: '45' });
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <PageHead title="Cities" />
      <ErrorBox error={error || list.error} />
      {(list.data ?? []).map((c: any) => <CityCard key={c.id} c={c} reload={list.reload} />)}
      {!adding ? <button className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>+ Add city · after pilot gates pass</button> : (
        <Card title="Add city">
          <form className="form two" onSubmit={async (e) => { e.preventDefault(); setError(null); try { await api('/admin/cities', { kind: 'admin', body: { name: f.name, centerLat: Number(f.lat), centerLng: Number(f.lng), radiusKm: Number(f.diameter) / 2 } }); setAdding(false); await list.reload(); } catch (err) { setError(err); } }}>
            <label>Name<input required onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label>Diameter (km)<input type="number" min="40" max="45" value={f.diameter} onChange={(e) => setF({ ...f, diameter: e.target.value })} /></label>
            <label>Centre latitude<input required onChange={(e) => setF({ ...f, lat: e.target.value })} /></label>
            <label>Centre longitude<input required onChange={(e) => setF({ ...f, lng: e.target.value })} /></label>
            <button>Add city</button>
            <p className="note">Then set its price. Orders can&apos;t be created in a city with no price.</p>
          </form>
        </Card>
      )}
    </>
  );
}

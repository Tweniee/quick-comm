'use client';
import { useState } from 'react';
import { LocationInput } from '@/components/LocationInput';
import { Card, ErrorBox, PageHead, usePoll } from '@/components/ui';
import { api, session } from '@/lib/api';

/** B17 · Pickup branches and team. */
export default function Branches() {
  const me = usePoll(() => api('/business/me', { kind: 'business' }), 60000);
  const users = usePoll(() => api('/business/users', { kind: 'business' }), 60000);
  const role = (typeof window !== 'undefined' ? session.meta<{ user?: { role: string } }>('business')?.user?.role : null) ?? 'OWNER';
  const owner = role === 'OWNER';
  const [adding, setAdding] = useState<'branch' | 'user' | null>(null);
  const [addr, setAddr] = useState<Record<string, string>>({});
  const [pin, setPin] = useState<{ lat?: number; lng?: number }>({});
  const [u, setU] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const run = async (fn: () => Promise<unknown>, msg: string) => { setError(null); setOk(''); try { await fn(); setOk(msg); setAdding(null); await me.reload(); await users.reload(); } catch (e) { setError(e); } };
  const b = me.data;
  return (
    <>
      <PageHead title="Pickup branches" sub="Riders come to these addresses. All branches share one wallet." />
      <ErrorBox error={error || me.error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      <div className="list">
        {(b?.addresses ?? []).map((a: any) => (
          <div key={a.id} className="item">
            <span className="row between"><b>{a.label}</b>{a.isDefault ? <span className="badge s-ACTIVE">Default</span> : owner && <button className="link" onClick={() => run(() => api(`/business/addresses/${a.id}`, { kind: 'business', method: 'PATCH', body: { isDefault: true, label: a.label, address: a.address, pincode: a.pincode, lat: a.lat, lng: a.lng } }), 'Default branch changed')}>Make default</button>}</span>
            <span className="small">{a.address}{a.pincode ? ` · ${a.pincode}` : ''}</span>
            <span className="row between small muted"><span>{a.landmark ?? ''}{a.contactPhone ? ` · ${a.contactPhone}` : ''} · map pin set</span>{owner && !a.isDefault && <button className="link" onClick={() => confirm(`Remove ${a.label}?`) && run(() => api(`/business/addresses/${a.id}`, { kind: 'business', method: 'DELETE' }), 'Branch removed')}>Remove</button>}</span>
          </div>
        ))}
      </div>
      {owner && adding !== 'branch' && <button className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding('branch')}>+ Add pickup address</button>}
      {adding === 'branch' && (
        <Card title="New pickup address">
          <form className="form" onSubmit={(e) => { e.preventDefault(); run(() => api('/business/addresses', { kind: 'business', body: { ...addr, lat: pin.lat, lng: pin.lng } }), 'Branch added'); }}>
            <div className="form two">
              <label>Name<input required placeholder="Mall Road branch" onChange={(e) => setAddr({ ...addr, label: e.target.value })} /></label>
              <label>Address<input required onChange={(e) => setAddr({ ...addr, address: e.target.value })} /></label>
              <label>Pincode<input required onChange={(e) => setAddr({ ...addr, pincode: e.target.value })} /></label>
              <label>Landmark<input onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} /></label>
              <label>Contact phone<input onChange={(e) => setAddr({ ...addr, contactPhone: e.target.value })} /></label>
            </div>
            <LocationInput value={pin} onChange={setPin} label="Map pin" />
            <div className="row"><button disabled={pin.lat == null}>Add branch</button><button type="button" className="secondary" onClick={() => setAdding(null)}>Cancel</button></div>
          </form>
        </Card>
      )}
      <h3 style={{ margin: '8px 0 0' }}>Team</h3>
      <div className="list">
        {(users.data ?? []).map((x: any) => (
          <div key={x.id} className="item" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="row"><span className="avatar">{x.name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}</span><span><b>{x.name}</b><div className="small muted">{x.role === 'OWNER' ? 'Owner · all access' : 'Staff · create orders'}{!x.active ? ' · turned off' : ''}</div></span></span>
            {owner && x.role !== 'OWNER' && <button className="link" onClick={() => run(() => api(`/business/users/${x.id}/active`, { kind: 'business', body: { active: !x.active } }), x.active ? 'Access turned off' : 'Access turned on')}>{x.active ? 'Turn off' : 'Turn on'}</button>}
          </div>
        ))}
      </div>
      {owner && adding !== 'user' && <button className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding('user')}>+ Add staff</button>}
      {adding === 'user' && (
        <Card title="Add staff">
          <form className="form two" onSubmit={(e) => { e.preventDefault(); run(() => api('/business/users', { kind: 'business', body: u }), 'Staff added. They log in with their phone and this password.'); }}>
            <label>Name<input required onChange={(e) => setU({ ...u, name: e.target.value })} /></label>
            <label>Phone<input required inputMode="numeric" onChange={(e) => setU({ ...u, phone: e.target.value })} /></label>
            <label>Email <span className="hint">optional</span><input type="email" onChange={(e) => setU({ ...u, email: e.target.value })} /></label>
            <label>Password<input required type="password" minLength={8} onChange={(e) => setU({ ...u, password: e.target.value })} /></label>
            <div className="row"><button>Add staff</button><button type="button" className="secondary" onClick={() => setAdding(null)}>Cancel</button></div>
          </form>
        </Card>
      )}
    </>
  );
}

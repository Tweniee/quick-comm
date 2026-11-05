'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, dt } from '@/lib/api';

function Drivers() {
  const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [search, setSearch] = useState('');
  const list = usePoll(() => api(`/admin/drivers?${new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { search } : {}) })}`, { kind: 'admin' }), 20000, [status, search]);
  const [cities, setCities] = useState<any[]>([]);
  const [f, setF] = useState<Record<string, string>>({ source: 'ZOMATO' });
  const [error, setError] = useState<unknown>(null);
  const [link, setLink] = useState<any>(null);
  useEffect(() => { api('/admin/cities', { kind: 'admin' }).then((c) => { setCities(c); if (c[0]) setF((x) => ({ ...x, cityId: c[0].id })); }); }, []);
  return (
    <>
      <h1>Drivers</h1>
      <ErrorBox error={error || list.error} />
      <Card title="Start onboarding">
        <form className="row" onSubmit={async (e) => { e.preventDefault(); setError(null); try { setLink(await api('/admin/drivers/invite', { kind: 'admin', body: f })); await list.reload(); } catch (err) { setError(err); } }}>
          <input required placeholder="Name" style={{ width: 180 }} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input required placeholder="Mobile" style={{ width: 150 }} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <select style={{ width: 160 }} value={f.cityId ?? ''} onChange={(e) => setF({ ...f, cityId: e.target.value })}>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select style={{ width: 140 }} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{['ZOMATO', 'SWIGGY', 'INSTAMART', 'REFERRAL', 'OTHER'].map((s) => <option key={s}>{s}</option>)}</select>
          <button>Send one-time link</button>
        </form>
        {link && <div className="alert ok" style={{ marginTop: 12 }}><span>Link sent by SMS and WhatsApp, valid till {dt(link.expiresAt)}. It works once, for this phone only.</span></div>}
      </Card>
      <div className="tabs">{['', 'INVITED', 'SUBMITTED', 'APPROVED', 'PAUSED', 'SUSPENDED', 'REJECTED', 'BLOCKED'].map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s || 'All'}</button>)}
        <input className="search" placeholder="Name, phone, vehicle" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Card>
        <div className="table-wrap"><table>
          <thead><tr><th>Driver</th><th>Status</th><th>Online</th><th>DL expiry</th><th>Deliveries</th><th>Source</th></tr></thead>
          <tbody>{(list.data ?? []).map((d: any) => (
            <tr key={d.id}>
              <td><Link href={`/admin/drivers/${d.id}`}>{d.name}</Link><div className="muted small">{d.phone} · {d.vehicleNumber ?? '—'}</div></td>
              <td><StatusBadge status={d.status} /></td><td>{d.availability}</td>
              <td className="small">{d.dlExpiry ? new Date(d.dlExpiry).toLocaleDateString() : '—'}</td>
              <td>{d.totalDeliveries} / {d.totalReturns} ret</td><td className="small">{d.source ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
    </>
  );
}
export default function Page() { return <Suspense><Drivers /></Suspense>; }

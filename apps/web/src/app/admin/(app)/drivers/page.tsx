'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Chips, ErrorBox, PageHead, usePoll } from '@/components/ui';
import { api, STATUS_LABEL } from '@/lib/api';

type Tab = 'all' | 'ONLINE' | 'BUSY' | 'PAUSED' | 'expiring' | 'inactive';
const month = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { month: 'short' }) : '');

function stateText(d: any) {
  if (d.status !== 'APPROVED') return `${d.status === 'PAUSED' ? 'Paused' : d.status === 'SUSPENDED' ? 'Suspended' : 'Blocked'}${d.statusReason ? ` · ${d.statusReason}` : ''}`;
  if (d.inactive) return 'Check-in needed';
  if (d.availability === 'BUSY') return `Busy · ${d.liveOrder ? (STATUS_LABEL[d.liveOrder.status] ?? '').toLowerCase() : 'on order'}`;
  if (d.availability === 'ONLINE') return 'Online · free';
  return 'Offline';
}
const tone = (d: any) => (d.status !== 'APPROVED' ? 's-PAUSED' : d.availability === 'BUSY' ? 's-BUSY' : d.availability === 'ONLINE' ? 's-ONLINE' : 's-OFFLINE');

/** A11 · Drivers. */
function Drivers() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) ?? 'all');
  const [search, setSearch] = useState('');
  const r = usePoll(() => api(`/admin/views/drivers?tab=${tab}&search=${encodeURIComponent(search)}`, { kind: 'admin' }), 15000, [tab, search]);
  const c = r.data?.counts ?? {};
  return (
    <>
      <PageHead title="Drivers" right={<input placeholder="Name, phone or bike number" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />} />
      <Chips<Tab> value={tab} onChange={setTab} options={[
        { value: 'all', label: `All · ${c.all ?? 0}` }, { value: 'ONLINE', label: `Online · ${c.ONLINE ?? 0}` }, { value: 'BUSY', label: `Busy · ${c.BUSY ?? 0}` },
        { value: 'PAUSED', label: `Paused · ${c.PAUSED ?? 0}` }, { value: 'expiring', label: `Expiring docs · ${c.expiring ?? 0}` }, { value: 'inactive', label: `Inactive 30 d · ${c.inactive ?? 0}` },
      ]} />
      <ErrorBox error={r.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Driver</th><th>State</th><th>Live order</th><th>This week</th><th>Documents</th><th></th></tr></thead>
          <tbody>
            {(r.data?.items ?? []).map((d: any) => (
              <tr key={d.id}>
                <td><b>{d.name}</b><div className="small muted">{d.source ?? '—'}{d.approvedAt ? ` · joined ${month(d.approvedAt)}` : ''}</div></td>
                <td><span className={`badge ${tone(d)}`}>{stateText(d)}</span></td>
                <td>{d.liveOrder ? <Link href={`/admin/orders/${d.liveOrder.id}`} className="mono">{d.liveOrder.code}</Link> : '—'}</td>
                <td>{d.week.deliveries}{d.week.returns ? ` + ${d.week.returns} return${d.week.returns > 1 ? 's' : ''}` : ''}</td>
                <td className={d.docs === 'Valid' ? 'small' : 'small bad-t'}>{d.docs}</td>
                <td><Link href={`/admin/drivers/${d.id}`}>{d.docs.includes('review') ? 'Review' : 'Open'}</Link></td>
              </tr>
            ))}
            {r.data && !r.data.items.length && <tr><td colSpan={6} className="muted">No drivers in this tab.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="grid g3">
        <div className="card soft"><b>Expiry alerts</b><p className="small" style={{ margin: '4px 0 0' }}>30, 15 and 7 days before. Auto-pause on the day.</p></div>
        <div className="card soft"><b>Suspend or block</b><p className="small" style={{ margin: '4px 0 0' }}>Immediate, with reason. Earnings held pending review.</p></div>
        <div className="card soft"><b>One live order</b><p className="small" style={{ margin: '4px 0 0' }}>Busy riders never get a second offer.</p></div>
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Drivers /></Suspense>; }

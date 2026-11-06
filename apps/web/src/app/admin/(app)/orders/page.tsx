'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Chips, ErrorBox, PageHead, StatusBadge, usePoll } from '@/components/ui';
import { api, rupees } from '@/lib/api';

type View = 'live' | 'NO_RIDER' | 'ARRIVED' | 'UNDELIVERED' | 'closed';

/** A02 · Orders. */
function Orders() {
  const sp = useSearchParams();
  const [view, setView] = useState<View>((sp.get('view') as View) ?? 'live');
  const [search, setSearch] = useState(sp.get('search') ?? '');
  const r = usePoll(() => api(`/admin/views/orders?view=${view}&search=${encodeURIComponent(search)}`, { kind: 'admin' }), 10000, [view, search]);
  const c = r.data?.counts ?? {};
  return (
    <>
      <PageHead title="Orders" right={<input placeholder="Filter by code, phone, business, rider" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 300 }} />} />
      <Chips<View> value={view} onChange={setView} options={[
        { value: 'live', label: `All live · ${c.live ?? 0}` },
        { value: 'NO_RIDER', label: `No Rider · ${c.NO_RIDER ?? 0}` },
        { value: 'ARRIVED', label: `Arrived · ${c.ARRIVED ?? 0}` },
        { value: 'UNDELIVERED', label: `Undelivered · ${c.UNDELIVERED ?? 0}` },
        { value: 'closed', label: `Closed today · ${c.closed ?? 0}` },
      ]} />
      <ErrorBox error={r.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Order</th><th>Business</th><th>Customer</th><th>Rider</th><th>Status</th><th>Since ready</th><th>Charged</th></tr></thead>
          <tbody>
            {(r.data?.items ?? []).map((o: any) => (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.id}`} className="mono strong">{o.code}</Link>{o.isTest && <span className="badge"> TEST</span>}</td>
                <td>{o.business}</td>
                <td className="mono small">{o.customer}</td>
                <td>{o.rider ?? '—'}</td>
                <td><StatusBadge status={o.status} /></td>
                <td>{o.sinceReadyMinutes != null ? `${o.sinceReadyMinutes} min` : '—'}</td>
                <td>{rupees(o.charged.amount)}{o.charged.held && <span className="muted small"> held</span>}</td>
              </tr>
            ))}
            {r.data && !r.data.items.length && <tr><td colSpan={7} className="muted">No orders in this view.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">Times are observed, never promised. Every row opens one screen with timeline, wallet, GPS, calls and OTP attempts.</p>
    </>
  );
}
export default function Page() { return <Suspense><Orders /></Suspense>; }

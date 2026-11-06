'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, dt, rupees } from '@/lib/api';

function List() {
  const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [search, setSearch] = useState('');
  const list = usePoll(() => api(`/admin/businesses?${new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { search } : {}) })}`, { kind: 'admin' }), 20000, [status, search]);
  return (
    <>
      <h1>Businesses</h1>
      <div className="tabs">{['', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s || 'All'}</button>)}
        <input className="search" placeholder="Search name, phone, email, GSTIN" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <ErrorBox error={list.error} />
      <Card>
        <div className="table-wrap"><table>
          <thead><tr><th>Business</th><th>Owner</th><th>Status</th><th>Wallet</th><th>API</th><th>Signed up</th></tr></thead>
          <tbody>{(list.data ?? []).map((b: any) => (
            <tr key={b.id}>
              <td><Link href={`/admin/businesses/${b.id}`}>{b.name}</Link>{b.flaggedForReview && <span title="Flagged for manual review"> ⚑</span>}<div className="muted small">{b.category} · {b.city?.name}</div></td>
              <td>{b.ownerName}<div className="muted small">{b.phone}</div></td>
              <td><StatusBadge status={b.status} /></td>
              <td>{rupees(b.walletBalance - b.walletHeld)}</td>
              <td>{b.apiEnabled ? 'Yes' : '—'}</td>
              <td className="small">{dt(b.createdAt)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
    </>
  );
}
export default function Page() { return <Suspense><List /></Suspense>; }

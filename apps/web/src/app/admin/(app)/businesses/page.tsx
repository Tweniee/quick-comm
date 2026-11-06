'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Chips, ErrorBox, PageHead, usePoll } from '@/components/ui';
import { ago } from '@/lib/api';
import { api } from '@/lib/api';

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
const TYPE: Record<string, string> = { INDIVIDUAL: 'Individual', SOLE_PROPRIETORSHIP: 'Sole prop.', PARTNERSHIP: 'Partnership', PRIVATE_LIMITED: 'Pvt Ltd', LLP: 'LLP' };

/** A05 · Business queue. */
function Queue() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get('status') as Tab) ?? 'PENDING');
  const [search, setSearch] = useState('');
  const r = usePoll(() => api(`/admin/views/businesses?status=${tab}&search=${encodeURIComponent(search)}`, { kind: 'admin' }), 20000, [tab, search]);
  const c = r.data?.counts ?? {};
  return (
    <>
      <PageHead title="Businesses" right={<input placeholder="Name or phone" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />} />
      <Chips<Tab> value={tab} onChange={setTab} options={[
        { value: 'PENDING', label: `Waiting review · ${c.PENDING ?? 0}` },
        { value: 'APPROVED', label: `Approved · ${c.APPROVED ?? 0}` },
        { value: 'REJECTED', label: `Rejected · ${c.REJECTED ?? 0}` },
        { value: 'SUSPENDED', label: `Suspended · ${c.SUSPENDED ?? 0}` },
      ]} />
      <ErrorBox error={r.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Business</th><th>Type</th><th>KYC path</th><th>Public presence</th><th>Flags</th><th>{tab === 'PENDING' ? 'Waiting' : 'Since'}</th></tr></thead>
          <tbody>
            {(r.data?.items ?? []).map((b: any) => (
              <tr key={b.id}>
                <td><Link href={`/admin/businesses/${b.id}`} className="strong">{b.name}</Link><div className="muted small">{[b.category, b.area].filter(Boolean).join(' · ') || '—'}</div></td>
                <td>{TYPE[b.type] ?? b.type}</td>
                <td className="small">{b.kycPath}</td>
                <td className="small">{b.presence.length ? b.presence.join(', ') : 'None'}</td>
                <td className="small">{b.flags.length ? <span className="bad-t">{b.flags.join(' · ')}</span> : 'None'}</td>
                <td className="small">{ago(b.waitingSince)}</td>
              </tr>
            ))}
            {r.data && !r.data.items.length && <tr><td colSpan={6} className="muted">Nothing in this tab.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">Every approval still needs a staff check: name matches presence, real shop at the pin, product fits a bike, no earlier rejection on this phone, GSTIN, PAN or address.</p>
    </>
  );
}
export default function Page() { return <Suspense><Queue /></Suspense>; }

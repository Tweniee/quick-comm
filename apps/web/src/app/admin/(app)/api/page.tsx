'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, ErrorBox, PageHead, usePoll } from '@/components/ui';
import { api, dt, tm } from '@/lib/api';

const EVENT: Record<string, string> = { 'order.picked_up': 'Picked Up', 'order.out_for_delivery': 'Out for Delivery', 'order.delivered': 'Delivered', 'order.undelivered': 'Undelivered', 'order.assigned': 'Assigned', 'order.returned': 'Returned' };

/** A08 · API and webhooks. */
export default function ApiPage() {
  const r = usePoll(() => api('/admin/views/api', { kind: 'admin' }), 20000);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const run = async (fn: () => Promise<unknown>, msg: string) => { setError(null); setOk(''); try { await fn(); setOk(msg); await r.reload(); } catch (e) { setError(e); } };
  const x = r.data;
  return (
    <>
      <PageHead title="API & webhooks" />
      <ErrorBox error={error || r.error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      {x?.requested?.length > 0 && (
        <div className="alert info"><span>Waiting for API access: {x.requested.map((b: any, i: number) => <span key={b.id}>{i > 0 && ', '}<Link href={`/admin/businesses/${b.id}`}>{b.name}</Link></span>)}</span></div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Business</th><th>Key</th><th>Env</th><th>Rate limit</th><th>Last used</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(x?.keys ?? []).map((k: any) => (
              <tr key={k.id}>
                <td><Link href={`/admin/businesses/${k.business.id}`}>{k.business.name}</Link></td>
                <td className="mono small">{k.keyMasked}</td>
                <td>{k.mode === 'LIVE' ? 'Live' : 'Test'}</td>
                <td className="small">{k.mode === 'LIVE' ? `${k.rateLimit.perMin}/min · ${(k.rateLimit.perDay / 1000).toFixed(0)}k/day` : 'Sandbox'}</td>
                <td className="small">{k.lastUsedAt ? dt(k.lastUsedAt) : 'Never'}</td>
                <td>{!k.active ? <span className="badge s-CANCELLED">Revoked</span> : k.mode === 'LIVE' ? <span className="badge s-ACTIVE">Active</span> : <span className="badge s-PENDING">Sandbox only</span>}</td>
                <td>
                  {k.active && k.mode === 'LIVE' && <button className="link" onClick={() => confirm(`Revoke ${k.keyMasked}? Calls with it stop at once.`) && run(() => api(`/admin/businesses/${k.business.id}/api-keys/${k.id}/revoke`, { kind: 'admin', body: {} }), 'Key revoked')}>Revoke</button>}
                  {k.active && k.mode === 'TEST' && !k.business.apiEnabled && <Link href={`/admin/businesses/${k.business.id}`}>Go live</Link>}
                </td>
              </tr>
            ))}
            {x && !x.keys.length && <tr><td colSpan={7} className="muted">No keys yet. Whitelist a business from its profile.</td></tr>}
          </tbody>
        </table>
      </div>
      <Card title="Failed webhooks · after 3 retries">
        {(x?.failedWebhooks ?? []).map((f: any) => (
          <div key={f.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--soft)' }}>
            <span><b>{f.business}</b> · {EVENT[f.event] ?? f.event} · <span className="mono">{f.orderCode ?? '—'}</span><div className="small muted">{f.error ?? 'Failed'} · {tm(f.at)}</div></span>
            <button className="secondary" onClick={() => run(() => api(`/admin/webhooks/${f.id}/retry`, { kind: 'admin', body: {} }), 'Retry queued')}>Retry now</button>
          </div>
        ))}
        {x && !x.failedWebhooks.length && <p className="muted">No failed webhooks.</p>}
      </Card>
      <div className="grid g3">
        <div className="card soft"><b>Signed</b><p className="small" style={{ margin: '4px 0 0' }}>Every webhook carries a timestamp and signature. HTTPS URLs only.</p></div>
        <div className="card soft"><b>Idempotent</b><p className="small" style={{ margin: '4px 0 0' }}>Same reference ID returns the first order. No second charge.</p></div>
        <div className="card soft"><b>Version v1, frozen</b><p className="small" style={{ margin: '4px 0 0' }}>Changes ship as v2 with a migration path.</p></div>
      </div>
    </>
  );
}

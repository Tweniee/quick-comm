'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DocLink } from '@/components/DocLink';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, dt, rupees } from '@/lib/api';
import { mapsLink } from '@/lib/geo';

export default function BusinessDetail({ params }: { params: { id: string } }) {
  const b = usePoll(() => api(`/admin/businesses/${params.id}`, { kind: 'admin' }), 30000, [params.id]);
  const pb = usePoll(() => api(`/admin/businesses/${params.id}/passbook`, { kind: 'admin' }), 30000, [params.id]);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const [adj, setAdj] = useState<Record<string, string>>({ kind: 'CREDIT' });
  const run = async (path: string, body: unknown, msg: string) => { setError(null); setOk(''); try { await api(path, { kind: 'admin', body }); setOk(msg); await b.reload(); await pb.reload(); } catch (e) { setError(e); } };
  const review = (action: string) => {
    const reason = action === 'APPROVE' || action === 'REACTIVATE' ? undefined : prompt('Reason (shown to the business):') ?? '';
    if (reason === '') return;
    run(`/admin/businesses/${params.id}/review`, { action, reason }, `Business ${action.toLowerCase()}d`);
  };
  const x = b.data;
  if (!x) return <ErrorBox error={b.error} />;
  return (
    <>
      <h1>{x.name} <StatusBadge status={x.status} /></h1>
      <ErrorBox error={error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      {x.statusReason && <div className="alert warn"><span>{x.statusReason}</span></div>}
      <div className="grid g2">
        <Card title="Verification" right={<div className="row">
          {['PENDING', 'REJECTED'].includes(x.status) && <button onClick={() => review('APPROVE')}>Approve</button>}
          {x.status === 'PENDING' && <button className="danger" onClick={() => review('REJECT')}>Reject</button>}
          {x.status === 'APPROVED' && <button className="danger" onClick={() => review('SUSPEND')}>Suspend</button>}
          {x.status === 'SUSPENDED' && <button onClick={() => review('REACTIVATE')}>Reactivate</button>}
        </div>}>
          <dl className="kv">
            <dt>Type</dt><dd>{x.type} · {x.category ?? '—'}</dd>
            <dt>Owner</dt><dd>{x.ownerName} · {x.phone} · {x.email}</dd>
            <dt>GSTIN / PAN</dt><dd>{x.gstin ?? '—'} / {x.pan ?? '—'}</dd>
            <dt>Presence</dt><dd>{[x.website, x.instagram, x.googleProfile].filter(Boolean).map((u: string) => <div key={u}><a href={u} target="_blank" rel="noreferrer">{u}</a></div>)}{!x.website && !x.instagram && !x.googleProfile && <span style={{ color: 'var(--bad)' }}>None given</span>}</dd>
            <dt>Terms accepted</dt><dd>{dt(x.termsAcceptedAt)}</dd>
            <dt>Rejections</dt><dd>{x.rejectionCount}</dd>
          </dl>
          {x.duplicates.length > 0 && <div className="alert error"><span>Possible duplicates: {x.duplicates.map((d: any) => `${d.name} (${d.status})`).join(', ')}</span></div>}
          <h3 style={{ marginTop: 12 }}>Checklist</h3>
          <ul className="small">{x.legitChecklist.map((c: string) => <li key={c}>{c}</li>)}</ul>
          <h3>Documents</h3>
          {x.documents.length ? x.documents.map((d: any) => <div key={d.id}><DocLink id={d.id} label={d.kind} /> <span className="muted small">{dt(d.createdAt)}</span></div>) : <p className="muted">No documents uploaded.</p>}
        </Card>
        <Card title="Pickup addresses">
          {x.addresses.map((a: any) => <div key={a.id} style={{ marginBottom: 6 }}><b>{a.label}</b> {a.address} {a.pincode} · <a href={mapsLink(a.lat, a.lng)} target="_blank" rel="noreferrer">map</a>{!a.active && ' (removed)'}</div>)}
          <h3 style={{ marginTop: 12 }}>Orders</h3>
          <div className="row">{Object.entries(x.orderCounts).map(([k, v]) => <span key={k}><StatusBadge status={k} /> {String(v)}</span>)}</div>
          <p className="small">Undelivered rate: <b>{Math.round(x.undeliveredRate * 100)}%</b> <Link href={`/admin/orders?businessId=${x.id}`}>See orders</Link></p>
        </Card>
        <Card title="API access">
          <p>{x.apiEnabled ? 'Enabled' : 'Not enabled'} · {x.rateLimitPerMin}/min, {x.rateLimitPerDay}/day · webhook {x.webhookUrl ?? 'not set'}</p>
          <div className="row">
            <button onClick={() => run(`/admin/businesses/${x.id}/api-access`, { enabled: !x.apiEnabled }, 'API access updated')}>{x.apiEnabled ? 'Disable API & revoke keys' : 'Whitelist for API'}</button>
          </div>
          <table style={{ marginTop: 8 }}><tbody>{x.apiKeys.map((k: any) => <tr key={k.id}><td className="mono small">{k.keyId}</td><td>{k.mode}</td><td>{k.active ? 'Active' : 'Revoked'}</td><td>{k.active && <button className="link" onClick={() => run(`/admin/businesses/${x.id}/api-keys/${k.id}/revoke`, {}, 'Key revoked')}>Revoke</button>}</td></tr>)}</tbody></table>
        </Card>
        <Card title={`Wallet: ${rupees(x.walletBalance)} (held ${rupees(x.walletHeld)})`}>
          <form className="form two" onSubmit={(e) => { e.preventDefault(); run(`/admin/businesses/${x.id}/wallet-adjust`, { kind: adj.kind, amount: Math.round(Number(adj.amount) * 100), reason: adj.reason, orderId: adj.orderId || undefined }, 'Wallet adjusted'); }}>
            <label>Type<select value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value })}><option value="CREDIT">Credit</option><option value="REFUND">Refund</option><option value="DEBIT_ADJUSTMENT">Debit adjustment</option></select></label>
            <label>Amount (₹)<input required type="number" min="1" onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></label>
            <label>Reason (visible in passbook)<input required onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></label>
            <label>Order id <span className="hint">optional</span><input onChange={(e) => setAdj({ ...adj, orderId: e.target.value })} /></label>
            <button>Apply adjustment</button>
          </form>
        </Card>
      </div>
      <Card title="Passbook">
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Order</th><th>Type</th><th>Amount</th><th>Balance</th><th>Held</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>{(pb.data ?? []).map((r: any) => <tr key={r.id}><td className="small">{dt(r.createdAt)}</td><td className="mono small">{r.order?.code ?? '—'}</td><td>{r.type}</td><td>{rupees(r.amount)}</td><td>{rupees(r.balanceAfter)}</td><td>{rupees(r.heldAfter)}</td><td className="small">{r.reason}</td><td className="small">{r.createdByType}</td></tr>)}</tbody></table></div>
      </Card>
    </>
  );
}

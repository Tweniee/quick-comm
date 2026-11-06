'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { DocLink } from '@/components/DocLink';
import { Card, ErrorBox, Stat, StatusBadge, usePoll } from '@/components/ui';
import { api, dateOnly, dt, LEDGER_LABEL, ledgerAmount, rupees } from '@/lib/api';
import { mapsLink } from '@/lib/geo';

const TYPE: Record<string, string> = { INDIVIDUAL: 'Individual', SOLE_PROPRIETORSHIP: 'Sole proprietorship', PARTNERSHIP: 'Partnership', PRIVATE_LIMITED: 'Private limited', LLP: 'LLP' };
const DOC: Record<string, string> = { SHOP_PHOTO: 'Shop board photo', GST_CERT: 'GST certificate', UDYAM: 'Udyam certificate', PAN: 'PAN', AADHAAR_FRONT: 'Aadhaar', SELFIE: 'Selfie', ADDRESS_PROOF: 'Address proof', PICKUP_PHOTO: 'Pickup photo', OTHER: 'Other document' };
const CHECKS = ['Presence matches name and pickup address', 'Real shop at the pin, signage visible', 'Products fit a bike', 'No earlier rejection: phone, GSTIN, PAN, address'];

function useActions(id: string, reload: () => Promise<void>) {
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const run = async (path: string, body: unknown, msg: string, method?: string) => {
    setError(null); setOk('');
    try { await api(path.startsWith('/') ? path : `/admin/businesses/${id}/${path}`, { kind: 'admin', body, method }); setOk(msg); await reload(); } catch (e) { setError(e); }
  };
  return { error, ok, run };
}

/** A06 · Business review (waiting businesses). */
function Review({ x, reload }: { x: any; reload: () => Promise<void> }) {
  const { error, ok, run } = useActions(x.id, reload);
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  const [note, setNote] = useState('');
  const pin = x.addresses.find((a: any) => a.isDefault && a.active) ?? x.addresses.find((a: any) => a.active);
  const contact = x.phoneVerifiedAt && x.emailVerifiedAt;
  const presence = [x.website && ['Website', x.website], x.instagram && ['Instagram', x.instagram], x.googleProfile && ['Google profile', x.googleProfile]].filter(Boolean) as string[][];
  return (
    <>
      <Link href="/admin/businesses" className="small">← Queue</Link>
      <div>
        <h1>Review · {x.name} <StatusBadge status={x.status} /></h1>
        <p className="sub" style={{ margin: 0 }}>{x.ownerName} · {TYPE[x.type] ?? x.type}{x.category ? ` · ${x.category}` : ''} · {x.phone} · {x.email}</p>
      </div>
      <ErrorBox error={error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      {x.statusReason && <div className="alert warn"><span>{x.statusReason}</span></div>}
      {!x.submittedAt && <div className="alert info"><span>The owner has not pressed Submit yet. You can still look, but they may be uploading.</span></div>}
      {!contact && <div className="alert warn"><span>Phone {x.phoneVerifiedAt ? 'verified' : 'not verified'} · email {x.emailVerifiedAt ? 'verified' : 'not verified'}. Approval needs both.</span></div>}
      {x.duplicates.length > 0 && <div className="alert error"><span>Earlier record on the same phone, GSTIN or PAN: {x.duplicates.map((d: any) => `${d.name} (${d.status.toLowerCase()})`).join(', ')}</span></div>}
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="grid g2">
          {x.documents.map((d: any) => (
            <div key={d.id} className="card"><b>{DOC[d.kind] ?? d.kind.replace(/_/g, ' ').toLowerCase()}</b><div className="small muted">{dt(d.createdAt)}{d.note ? ` · ${d.note}` : ''}</div><DocLink id={d.id} label="View (logged)" /></div>
          ))}
          <div className="card"><b>Map pin{pin ? ` · ${pin.label}` : ''}</b><div className="small muted">{pin ? `${pin.address} ${pin.pincode ?? ''}` : 'No pickup address yet'}</div>{pin && <a href={mapsLink(pin.lat, pin.lng)} target="_blank" rel="noreferrer">Open map</a>}</div>
          {presence.map(([k, v]) => <div key={k} className="card"><b>{k}</b><div className="small"><a href={v.startsWith('http') ? v : `https://${v}`} target="_blank" rel="noreferrer">{v}</a></div></div>)}
          {!presence.length && <div className="card"><b>Public presence</b><div className="small bad-t">None given. Check the shop photo and pin carefully.</div></div>}
          {(x.gstin || x.pan) && <div className="card"><b>Tax IDs</b><div className="small">{x.gstin && `GSTIN ${x.gstin}`}{x.gstin && x.pan && ' · '}{x.pan && `PAN ${x.pan}`}</div></div>}
        </div>
        <Card title="Staff checklist">
          <div className="stack">
            {CHECKS.map((c, i) => <label key={c} className="check"><input type="checkbox" checked={checked[i]} onChange={(e) => setChecked(checked.map((v, j) => (j === i ? e.target.checked : v)))} />{c}</label>)}
            <label>Note for the audit log<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <button className="big" disabled={!checked.every(Boolean) || !contact || !pin} onClick={() => run('review', { action: 'APPROVE', reason: note || undefined }, 'Business approved. The owner gets an SMS.')}>Approve business</button>
            <div className="row">
              <button className="secondary" style={{ flex: 1 }} onClick={() => { const r = prompt('What should they re-upload? (sent by SMS)'); if (r) run('review', { action: 'REQUEST_REUPLOAD', reason: r }, 'Asked for re-upload'); }}>Ask re-upload</button>
              <button className="danger" style={{ flex: 1 }} onClick={() => { const r = prompt('Reason (shown to the business)'); if (r) run('review', { action: 'REJECT', reason: r }, 'Business rejected'); }}>Reject…</button>
            </div>
            <p className="note">Tick all four checks to approve. Each document view is logged.</p>
          </div>
        </Card>
      </div>
    </>
  );
}

/** A07 · Business profile (approved, rejected, suspended). */
function Profile({ x, reload }: { x: any; reload: () => Promise<void> }) {
  const sp = useSearchParams();
  const { error, ok, run } = useActions(x.id, reload);
  const stats = usePoll(() => api(`/admin/views/businesses/${x.id}/stats`, { kind: 'admin' }), 60000, [x.id]);
  const pb = usePoll(() => api(`/admin/businesses/${x.id}/passbook`, { kind: 'admin' }), 30000, [x.id]);
  const [adj, setAdj] = useState<Record<string, string>>({ kind: 'CREDIT', orderId: sp.get('order') ?? '' });
  const [limits, setLimits] = useState({ perMin: String(x.rateLimitPerMin), perDay: String(x.rateLimitPerDay) });
  const s = stats.data;
  const branches = x.addresses.filter((a: any) => a.active);
  const users = x.users.filter((u: any) => u.active);
  return (
    <>
      <Link href="/admin/businesses" className="small">← Businesses</Link>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>{x.name} <StatusBadge status={x.status} /></h1>
          <p className="sub" style={{ margin: 0 }}>{x.verifiedAt ? `Approved ${dateOnly(x.verifiedAt)}${x.verifiedByName ? ` by ${x.verifiedByName}` : ''} · ` : ''}{branches.length} branch{branches.length === 1 ? '' : 'es'} · {users.length} user{users.length === 1 ? '' : 's'} · {x.ownerName} · {x.phone}</p>
        </div>
        <div className="row">
          {x.status === 'APPROVED' && <button className="danger" onClick={() => { const r = prompt('Reason (shown to the business)'); if (r) run('review', { action: 'SUSPEND', reason: r }, 'Business suspended'); }}>Suspend business</button>}
          {x.status === 'SUSPENDED' && <button onClick={() => run('review', { action: 'REACTIVATE' }, 'Business reactivated')}>Reactivate</button>}
          {x.status === 'REJECTED' && <button onClick={() => run('review', { action: 'APPROVE' }, 'Business approved')}>Approve after appeal</button>}
        </div>
      </div>
      <ErrorBox error={error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      {x.statusReason && <div className="alert warn"><span>{x.statusReason}</span></div>}
      <div className="grid g4">
        <Stat label="Wallet" value={rupees(x.walletBalance)} />
        <Stat label="Orders this week" value={s?.ordersThisWeek ?? '—'} />
        <Stat label="Undelivered rate" value={s ? `${(s.undeliveredRate30d * 100).toFixed(1)}%` : '—'} tone={s && s.undeliveredRate30d > 0.1 ? 'bad' : undefined} />
        <Stat label="Open tickets" value={s?.openTickets ?? '—'} tone={s?.openTickets ? 'warn' : undefined} />
      </div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title={<span id="wallet">Wallet adjustment</span>}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); run('wallet-adjust', { kind: adj.kind, amount: Math.round(Number(adj.amount) * 100), reason: adj.reason, orderId: adj.orderId || undefined }, 'Entry added to the passbook'); }}>
            <div className="seg">{[['CREDIT', 'Credit'], ['REFUND', 'Refund'], ['DEBIT_ADJUSTMENT', 'Debit']].map(([k, l]) => <button type="button" key={k} className={adj.kind === k ? 'on' : ''} onClick={() => setAdj({ ...adj, kind: k })}>{l}</button>)}</div>
            <label>Amount (₹)<input required type="number" min="1" value={adj.amount ?? ''} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></label>
            <label>Reason (shown in their passbook)<input required value={adj.reason ?? ''} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></label>
            {adj.orderId && <p className="small muted">Linked to the order you came from.</p>}
            <p className="note">The ledger is append-only: corrections are new entries, never edits.</p>
            <button>Add entry</button>
          </form>
        </Card>
        <Card title={<>API access {x.apiEnabled ? <span className="badge s-ACTIVE">Live</span> : <span className="badge s-PENDING">Not whitelisted</span>}</>}>
          <div className="stack">
            {!x.apiEnabled && <p className="small" style={{ margin: 0 }}>{x.status === 'APPROVED' ? 'Business is approved, so it can be whitelisted.' : 'Only approved businesses can be whitelisted.'}</p>}
            <div className="row">
              <label style={{ flex: 1 }}>Per minute<input type="number" value={limits.perMin} onChange={(e) => setLimits({ ...limits, perMin: e.target.value })} /></label>
              <label style={{ flex: 1 }}>Per day<input type="number" value={limits.perDay} onChange={(e) => setLimits({ ...limits, perDay: e.target.value })} /></label>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Environments: Test + Live keys. Super Admin only.</p>
            <div className="row">
              <button disabled={x.status !== 'APPROVED'} onClick={() => run('api-access', { enabled: true, rateLimitPerMin: Number(limits.perMin), rateLimitPerDay: Number(limits.perDay) }, x.apiEnabled ? 'Limits updated' : 'Whitelisted. The business can now create keys.')}>{x.apiEnabled ? 'Save limits' : 'Whitelist & issue keys'}</button>
              {x.apiEnabled && <button className="danger" onClick={() => confirm('Turn off API and revoke every key?') && run('api-access', { enabled: false }, 'API turned off, keys revoked')}>Turn off API</button>}
            </div>
            {x.apiKeys.map((k: any) => <div key={k.id} className="row between small"><span className="mono">{k.keyId}</span><span>{k.mode.toLowerCase()} · {k.active ? 'active' : 'revoked'} {k.active && <button className="link" onClick={() => run(`api-keys/${k.id}/revoke`, {}, 'Key revoked')}>Revoke</button>}</span></div>)}
          </div>
        </Card>
        <Card title="Branches">
          {branches.map((a: any) => <div key={a.id} className="small" style={{ marginBottom: 6 }}><b>{a.label}</b>{a.isDefault ? ' · default' : ''} · {a.address} · <a href={mapsLink(a.lat, a.lng)} target="_blank" rel="noreferrer">map</a></div>)}
        </Card>
        <Card title="Users">
          {x.users.map((u: any) => <div key={u.id} className="small" style={{ marginBottom: 6 }}><b>{u.name}</b> · {u.role.toLowerCase()} · {u.phone}{!u.active && ' · turned off'}</div>)}
        </Card>
      </div>
      <Card title="Passbook">
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Order</th><th>Entry</th><th>Amount</th><th>Balance</th><th>Reason</th></tr></thead>
          <tbody>{(pb.data ?? []).map((r: any) => <tr key={r.id}><td className="small">{dt(r.createdAt)}</td><td className="mono small">{r.order?.code ?? '—'}</td><td className="small">{LEDGER_LABEL[r.type] ?? r.type}</td><td>{ledgerAmount(r.type, r.amount)}</td><td>{rupees(r.balanceAfter)}</td><td className="small">{r.reason}</td></tr>)}</tbody></table></div>
      </Card>
    </>
  );
}

function BusinessPage({ id }: { id: string }) {
  const b = usePoll(() => api(`/admin/businesses/${id}`, { kind: 'admin' }), 30000, [id]);
  if (!b.data) return <ErrorBox error={b.error} />;
  return b.data.status === 'PENDING' ? <Review x={b.data} reload={b.reload} /> : <Profile x={b.data} reload={b.reload} />;
}
export default function Page({ params }: { params: { id: string } }) { return <Suspense><BusinessPage id={params.id} /></Suspense>; }

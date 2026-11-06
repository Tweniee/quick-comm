'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DocLink } from '@/components/DocLink';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, dt, rupees } from '@/lib/api';

const CHECK_LABEL: Record<string, string> = { ageOk: '18 or older', dlValid30Days: 'DL valid 30+ days', rcValid: 'RC valid', bankNameMatches: 'Bank name matches driver', allDocsUploaded: 'All documents uploaded', noDuplicates: 'No duplicate phone / DL / Aadhaar' };

export default function DriverDetail({ params }: { params: { id: string } }) {
  const d = usePoll(() => api(`/admin/drivers/${params.id}`, { kind: 'admin' }), 30000, [params.id]);
  const e = usePoll(() => api(`/admin/drivers/${params.id}/earnings`, { kind: 'admin' }), 60000, [params.id]);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const act = async (action: string) => {
    let body: Record<string, string | undefined> = { action };
    if (!['APPROVE', 'REACTIVATE'].includes(action)) { const r = prompt('Reason (sent to the driver):'); if (!r) return; body.reason = r; }
    if (action === 'REACTIVATE') { body.dlExpiry = prompt('DL valid till (YYYY-MM-DD), blank to keep') || undefined; body.rcExpiry = prompt('RC valid till (YYYY-MM-DD), blank to keep') || undefined; }
    setError(null);
    try { await api(`/admin/drivers/${params.id}/review`, { kind: 'admin', body }); setOk(`Done: ${action}`); await d.reload(); } catch (err) { setError(err); }
  };
  const x = d.data;
  if (!x) return <ErrorBox error={d.error} />;
  const r = x.driver;
  return (
    <>
      <h1>{r.name} <StatusBadge status={r.status} /></h1>
      <ErrorBox error={error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      {r.statusReason && <div className="alert warn"><span>{r.statusReason}</span></div>}
      <div className="row" style={{ marginBottom: 16 }}>
        {r.status === 'SUBMITTED' && <><button onClick={() => act('APPROVE')}>Approve</button><button className="secondary" onClick={() => act('REQUEST_REUPLOAD')}>Ask for re-upload</button><button className="danger" onClick={() => act('REJECT')}>Reject</button></>}
        {['INVITED', 'REJECTED'].includes(r.status) && <button className="secondary" onClick={async () => { try { await api(`/admin/drivers/${params.id}/send-link`, { kind: 'admin', body: {} }); setOk('Fresh link sent; older links no longer work'); } catch (err) { setError(err); } }}>Send fresh link</button>}
        {r.status === 'APPROVED' && <><button className="secondary" onClick={() => act('PAUSE')}>Pause</button><button className="danger" onClick={() => act('SUSPEND')}>Suspend</button></>}
        {['PAUSED', 'SUSPENDED'].includes(r.status) && <button onClick={() => act('REACTIVATE')}>Reactivate</button>}
        {r.status !== 'BLOCKED' && <button className="danger" onClick={() => act('BLOCK')}>Block</button>}
      </div>
      <div className="grid g2">
        <Card title="Automatic checks">
          {Object.entries(x.checks).map(([k, v]) => <div key={k}>{v ? '✅' : '❌'} {CHECK_LABEL[k] ?? k}</div>)}
          {x.duplicates.length > 0 && <div className="alert error"><span>Duplicates: {x.duplicates.map((u: any) => `${u.name} (${u.status})`).join(', ')}</span></div>}
          <h3 style={{ marginTop: 12 }}>Check by eye</h3>
          <ul className="small">{x.manualChecklist.map((c: string) => <li key={c}>{c}</li>)}</ul>
        </Card>
        <Card title="Details">
          <dl className="kv">
            <dt>Phone</dt><dd>{r.phone}</dd><dt>DOB</dt><dd>{r.dob ? new Date(r.dob).toLocaleDateString() : '—'}</dd>
            <dt>Address</dt><dd>{r.address ?? '—'}</dd><dt>Emergency</dt><dd>{r.emergencyContact ?? '—'}</dd>
            <dt>DL</dt><dd>{r.dlNumber ?? '—'} · till {r.dlExpiry ? new Date(r.dlExpiry).toLocaleDateString() : '—'}</dd>
            <dt>RC / vehicle</dt><dd>{r.rcNumber ?? '—'} · {r.vehicleNumber ?? '—'} · {r.bikeModel ?? ''} · till {r.rcExpiry ? new Date(r.rcExpiry).toLocaleDateString() : '—'}</dd>
            <dt>Aadhaar</dt><dd>{r.aadhaar ?? '—'}</dd>
            <dt>Bank</dt><dd>{r.bankAccount ?? '—'} · {r.ifsc ?? ''} · {r.accountHolderName ?? ''}</dd>
            <dt>Source</dt><dd>{r.source ?? '—'}</dd><dt>Live order</dt><dd>{r.currentOrderId ? <Link href={`/admin/orders/${r.currentOrderId}`}>open</Link> : '—'}</dd>
          </dl>
        </Card>
        <Card title="Documents (private, views are logged)">
          {x.documents.length ? x.documents.map((doc: any) => <div key={doc.id}><DocLink id={doc.id} label={doc.kind} /> <span className="muted small">{dt(doc.createdAt)} {doc.note}</span></div>) : <p className="muted">Nothing uploaded yet.</p>}
          <h3 style={{ marginTop: 12 }}>Onboarding links</h3>
          {x.onboardingLinks.map((l: any) => <div key={l.id} className="small">{dt(l.createdAt)} → expires {dt(l.expiresAt)} {l.usedAt ? '· used' : l.revokedAt ? '· replaced' : ''}</div>)}
        </Card>
        <Card title="Earnings">
          <dl className="kv"><dt>Today</dt><dd>{rupees(e.data?.today.amount)}</dd><dt>This week</dt><dd>{rupees(e.data?.thisWeek.amount)}</dd><dt>Unpaid</dt><dd>{rupees(e.data?.unpaid)}</dd></dl>
        </Card>
      </div>
    </>
  );
}

'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DocLink } from '@/components/DocLink';
import { Card, ErrorBox, Stat, StatusBadge, usePoll } from '@/components/ui';
import { api, dateOnly, dt, rupees } from '@/lib/api';

const AUTO: Record<string, string> = { ageOk: '18 or older', dlValid30Days: 'DL valid 30+ days', rcValid: 'RC valid', bankNameMatches: 'Bank name matches', allDocsUploaded: 'All documents uploaded', noDuplicates: 'Duplicate check clear' };
const DOC_GROUPS: { title: string; kinds: string[]; detail: (r: any) => string }[] = [
  { title: 'Live selfie', kinds: ['SELFIE'], detail: () => 'Compare with the DL photo' },
  { title: 'Driving Licence', kinds: ['DL_FRONT', 'DL_BACK'], detail: (r) => `${r.dlNumber ?? '—'} · valid till ${dateOnly(r.dlExpiry)}` },
  { title: 'Vehicle RC', kinds: ['RC_FRONT', 'RC_BACK'], detail: (r) => `${r.rcNumber ?? '—'} · valid till ${dateOnly(r.rcExpiry)}` },
  { title: 'Bike photo', kinds: ['BIKE_PHOTO'], detail: (r) => `Plate ${r.vehicleNumber ?? '—'}${r.bikeModel ? ` · ${r.bikeModel}` : ''}` },
  { title: 'Aadhaar · masked', kinds: ['AADHAAR_FRONT', 'AADHAAR_BACK'], detail: (r) => r.aadhaar ?? '—' },
  { title: 'Bank passbook', kinds: ['BANK_PROOF'], detail: (r) => `${r.bankAccount ?? '—'} · ${r.accountHolderName ?? ''}` },
];
const age = (dob?: string | null) => (dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000)) : null);

/** A10 · Driver review, and the driver's profile once active. */
export default function DriverDetail({ params }: { params: { id: string } }) {
  const d = usePoll(() => api(`/admin/drivers/${params.id}`, { kind: 'admin' }), 30000, [params.id]);
  const e = usePoll(() => api(`/admin/drivers/${params.id}/earnings`, { kind: 'admin' }), 60000, [params.id]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const act = async (action: string, msg: string) => {
    const body: Record<string, string | undefined> = { action };
    if (!['APPROVE', 'REACTIVATE'].includes(action)) { const r = prompt(action === 'REQUEST_REUPLOAD' ? 'What should they re-upload? (sent to the driver)' : 'Reason (sent to the driver)'); if (!r) return; body.reason = r; }
    if (action === 'REACTIVATE') { body.dlExpiry = prompt('DL valid till (YYYY-MM-DD), blank to keep') || undefined; body.rcExpiry = prompt('RC valid till (YYYY-MM-DD), blank to keep') || undefined; }
    setError(null); setOk('');
    try { await api(`/admin/drivers/${params.id}/review`, { kind: 'admin', body }); setOk(msg); await d.reload(); } catch (err) { setError(err); }
  };
  const x = d.data;
  if (!x) return <ErrorBox error={d.error} />;
  const r = x.driver;
  const reviewing = r.status === 'SUBMITTED';
  const docsOk = x.checks.dlValid30Days && x.checks.rcValid;
  const allChecked = x.manualChecklist.every((_: string, i: number) => checked[i]);
  return (
    <>
      <Link href={reviewing || r.status === 'INVITED' ? '/admin/onboarding' : '/admin/drivers'} className="small">← {reviewing || r.status === 'INVITED' ? 'Onboarding' : 'Drivers'}</Link>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>{reviewing ? 'Review · ' : ''}{r.name} <StatusBadge status={r.availability && r.status === 'APPROVED' ? r.availability : r.status} /></h1>
          <p className="sub" style={{ margin: 0 }}>Source: {r.source ?? '—'}{r.submittedAt ? ` · Submitted ${dt(r.submittedAt)}` : ''}{age(r.dob) != null ? ` · Age ${age(r.dob)} per DL` : ''} · {x.checks.noDuplicates ? 'Duplicate check clear' : 'Possible duplicate'} · {r.phone}</p>
        </div>
        {!reviewing && (
          <div className="row">
            {['INVITED', 'REJECTED'].includes(r.status) && <button className="secondary" onClick={async () => { try { await api(`/admin/drivers/${params.id}/send-link`, { kind: 'admin', body: {} }); setOk('Fresh link sent; older links no longer work'); } catch (err) { setError(err); } }}>Send fresh link</button>}
            {r.status === 'APPROVED' && <><button className="secondary" onClick={() => act('PAUSE', 'Driver paused')}>Pause</button><button className="danger" onClick={() => act('SUSPEND', 'Driver suspended, earnings held')}>Suspend</button></>}
            {['PAUSED', 'SUSPENDED'].includes(r.status) && <button onClick={() => act('REACTIVATE', 'Driver reactivated')}>Reactivate</button>}
            {!['BLOCKED', 'INVITED'].includes(r.status) && <button className="danger" onClick={() => act('BLOCK', 'Driver blocked')}>Block</button>}
          </div>
        )}
      </div>
      <ErrorBox error={error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      {r.statusReason && <div className="alert warn"><span>{r.statusReason}</span></div>}
      {x.duplicates.length > 0 && <div className="alert error"><span>Same phone, DL or Aadhaar as: {x.duplicates.map((u: any) => `${u.name} (${u.status.toLowerCase()})`).join(', ')}</span></div>}
      {!reviewing && r.status !== 'INVITED' && (
        <div className="grid g4">
          <Stat label="Today" value={rupees(e.data?.today?.amount)} />
          <Stat label="This week" value={rupees(e.data?.thisWeek?.amount)} />
          <Stat label="Unpaid" value={rupees(e.data?.unpaid)} />
          <Stat label="Live order" value={r.currentOrderId ? <Link href={`/admin/orders/${r.currentOrderId}`}>Open</Link> : '—'} />
        </div>
      )}
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="grid g2">
          {DOC_GROUPS.map((g) => {
            const docs = x.documents.filter((doc: any) => g.kinds.includes(doc.kind));
            return (
              <div key={g.title} className="card">
                <b>{g.title}</b>
                <div className="small muted">{g.detail(r)}</div>
                {docs.length ? <div className="row small">{docs.map((doc: any) => <DocLink key={doc.id} id={doc.id} label={doc.kind.endsWith('_BACK') ? 'Back' : doc.kind.endsWith('_FRONT') ? 'Front' : 'View'} />)}</div> : <span className="small bad-t">Not uploaded</span>}
              </div>
            );
          })}
        </div>
        <Card title={reviewing ? 'Support checklist' : 'Checks'}>
          <div className="stack">
            {x.manualChecklist.map((c: string, i: number) => (
              reviewing
                ? <label key={c} className="check"><input type="checkbox" checked={!!checked[i]} onChange={(ev) => setChecked({ ...checked, [i]: ev.target.checked })} />{c}</label>
                : <div key={c} className="checkrow"><span className="dot">✓</span>{c}</div>
            ))}
            <div className="small">{Object.entries(x.checks).map(([k, v]) => <div key={k} className="checkrow"><span className={`dot ${v ? '' : 'bad'}`}>{v ? '✓' : '!'}</span>{AUTO[k] ?? k}</div>)}</div>
            {reviewing && (
              <>
                <p className={`small ${docsOk ? '' : 'bad-t'}`} style={{ margin: 0 }}>{docsOk ? 'DL and RC valid for 30+ days: passed.' : 'An expired or expiring document blocks approval.'}</p>
                <button className="big" disabled={!allChecked || !docsOk} onClick={() => act('APPROVE', 'Approved. The driver can log in to the app now.')}>Approve &amp; activate</button>
                <div className="row">
                  <button className="secondary" style={{ flex: 1 }} onClick={() => act('REQUEST_REUPLOAD', 'Asked for re-upload. A fresh link was sent.')}>Ask re-upload</button>
                  <button className="danger" style={{ flex: 1 }} onClick={() => act('REJECT', 'Driver rejected')}>Reject…</button>
                </div>
                <p className="note">No auto-approval. Each document view is logged.</p>
              </>
            )}
          </div>
        </Card>
      </div>
      {!reviewing && (
        <Card title="Details">
          <dl className="kv">
            <dt>Address</dt><dd>{r.address ?? '—'}</dd><dt>Emergency</dt><dd>{r.emergencyContact ?? '—'}</dd>
            <dt>Bank</dt><dd>{r.bankAccount ?? '—'} · {r.ifsc ?? ''}</dd>
            <dt>Links</dt><dd>{x.onboardingLinks.map((l: any) => <div key={l.id} className="small">{dt(l.createdAt)} → {l.usedAt ? 'used' : l.revokedAt ? 'replaced' : `expires ${dt(l.expiresAt)}`}</div>)}</dd>
          </dl>
        </Card>
      )}
    </>
  );
}

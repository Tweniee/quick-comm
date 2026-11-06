'use client';
import { useState } from 'react';
import { LocationInput } from '@/components/LocationInput';
import { Card, ErrorBox, StatusBadge, usePoll } from '@/components/ui';
import { api, dt } from '@/lib/api';

const DOC_KINDS = [['SHOP_PHOTO', 'Shop board / storefront photo'], ['PAN', 'PAN'], ['GST_CERT', 'GST certificate'], ['SHOP_LICENCE', 'Shop / trade licence'], ['UDYAM', 'Udyam certificate'], ['INCORPORATION_CERT', 'Incorporation certificate'], ['AADHAAR', 'Owner Aadhaar'], ['SELFIE', 'Owner selfie'], ['ADDRESS_PROOF', 'Pickup address proof'], ['OTHER', 'Other']];

export default function Settings() {
  const me = usePoll(() => api('/business/me', { kind: 'business' }), 60000);
  const keys = usePoll(() => api('/business/api-keys', { kind: 'business' }).catch(() => []), 60000);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const [secret, setSecret] = useState<any>(null);
  const [docKind, setDocKind] = useState('SHOP_PHOTO');
  const [addr, setAddr] = useState<Record<string, string>>({});
  const [pin, setPin] = useState<{ lat?: number; lng?: number }>({});
  const [hook, setHook] = useState('');
  const b = me.data;
  const run = async (fn: () => Promise<unknown>, msg: string) => { setError(null); setOk(''); try { await fn(); setOk(msg); await me.reload(); await keys.reload(); } catch (e) { setError(e); } };

  if (!b) return <ErrorBox error={me.error} />;
  return (
    <>
      <h1>Settings</h1>
      <ErrorBox error={error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      <Card title={<>Verification <StatusBadge status={b.status} /></>}>
        {b.statusReason && <p className="muted">{b.statusReason}</p>}
        <p className="muted small">Upload: a shop board or storefront photo, PAN, GST certificate (if registered) or shop licence / Udyam, owner Aadhaar and selfie, and pickup address proof. Staff review takes 1 to 2 business days.</p>
        <div className="row">
          <select style={{ width: 260 }} value={docKind} onChange={(e) => setDocKind(e.target.value)}>{DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input type="file" accept="image/*,application/pdf" style={{ width: 260 }} onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const fd = new FormData(); fd.append('kind', docKind); fd.append('file', file);
            run(() => api('/business/documents', { kind: 'business', form: fd }), 'Document uploaded');
          }} />
        </div>
        <table style={{ marginTop: 12 }}><tbody>{b.documents.map((d: any) => <tr key={d.id}><td>{d.kind}</td><td><StatusBadge status={d.status} /></td><td className="small muted">{dt(d.createdAt)}</td></tr>)}</tbody></table>
      </Card>

      <Card title="Pickup addresses (branches)">
        <table><tbody>{b.addresses.map((a: any) => (
          <tr key={a.id}><td><b>{a.label}</b>{a.isDefault && <span className="badge" style={{ marginLeft: 6 }}>Default</span>}</td><td>{a.address} {a.pincode}</td>
            <td>{!a.isDefault && <button className="link" onClick={() => run(() => api(`/business/addresses/${a.id}`, { kind: 'business', method: 'PATCH', body: { isDefault: true, address: a.address, pincode: a.pincode, lat: a.lat, lng: a.lng } }), 'Default updated')}>Make default</button>}
              {' '}<button className="link" onClick={() => run(() => api(`/business/addresses/${a.id}`, { kind: 'business', method: 'DELETE' }), 'Removed')}>Remove</button></td></tr>
        ))}</tbody></table>
        <div className="form two" style={{ marginTop: 12 }}>
          <label>Label<input placeholder="Branch 2" onChange={(e) => setAddr({ ...addr, label: e.target.value })} /></label>
          <label>Address<input onChange={(e) => setAddr({ ...addr, address: e.target.value })} /></label>
          <label>Pincode<input onChange={(e) => setAddr({ ...addr, pincode: e.target.value })} /></label>
          <label>Contact phone<input onChange={(e) => setAddr({ ...addr, contactPhone: e.target.value })} /></label>
        </div>
        <LocationInput value={pin} onChange={setPin} />
        <button style={{ marginTop: 8 }} onClick={() => run(() => api('/business/addresses', { kind: 'business', body: { ...addr, lat: pin.lat, lng: pin.lng } }), 'Address added')}>Add pickup address</button>
      </Card>

      <Card title="API & webhooks">
        {!b.apiEnabled ? (
          <p className="muted">API access is not enabled yet. It is given to verified businesses on request. <button className="link" onClick={() => run(() => api('/business/tickets', { kind: 'business', body: { type: 'BUSINESS_ISSUE', subject: 'API access request', body: 'Please enable API access for our business.' } }), 'Request sent to support')}>Request API access</button></p>
        ) : (
          <>
            <p className="muted small">Authenticate with headers <code>X-API-Key</code> and <code>X-API-Secret</code>. Base URL <code>/api/v1</code>. Test keys run in the sandbox: no real riders, no wallet deduction. Rate limit {b.rateLimitPerMin}/min, {b.rateLimitPerDay}/day.</p>
            <div className="row">
              <button onClick={() => run(async () => setSecret(await api('/business/api-keys', { kind: 'business', body: { mode: 'TEST' } })), 'Test key created')}>New test key</button>
              <button onClick={() => run(async () => setSecret(await api('/business/api-keys', { kind: 'business', body: { mode: 'LIVE' } })), 'Live key created')}>New live key</button>
            </div>
            {secret?.secret && <div className="alert warn"><span>Copy now, shown once. Key <code>{secret.keyId}</code> secret <code>{secret.secret}</code></span></div>}
            <table style={{ marginTop: 12 }}><tbody>{(keys.data ?? []).map((k: any) => (
              <tr key={k.id}><td className="mono">{k.keyId}</td><td>{k.mode}</td><td>{k.active ? 'Active' : 'Revoked'}</td><td className="small muted">last used {dt(k.lastUsedAt)}</td>
                <td>{k.active && <button className="link" onClick={() => confirm('Revoke this key? It stops working immediately.') && run(() => api(`/business/api-keys/${k.id}`, { kind: 'business', method: 'DELETE' }), 'Key revoked')}>Revoke</button>}</td></tr>
            ))}</tbody></table>
            <h3 style={{ marginTop: 16 }}>Webhook</h3>
            <p className="muted small">Every status change is POSTed to this HTTPS URL, signed: <code>X-QD-Signature = HMAC_SHA256(secret, timestamp + "." + body)</code>. 3 retries with backoff.</p>
            <div className="row">
              <input style={{ flex: 1 }} placeholder={b.webhookUrl ?? 'https://your-shop.com/qd-webhook'} value={hook} onChange={(e) => setHook(e.target.value)} />
              <button onClick={() => run(async () => setSecret(await api('/business/webhook', { kind: 'business', body: { url: hook } })), 'Webhook saved')}>Save</button>
              {b.webhookSecretSet && <button className="secondary" onClick={() => run(async () => setSecret(await api('/business/webhook/rotate-secret', { kind: 'business', body: {} })), 'Secret rotated')}>Rotate secret</button>}
            </div>
            {secret?.webhookSecret && <div className="alert warn"><span>Webhook signing secret (shown once): <code>{secret.webhookSecret}</code></span></div>}
          </>
        )}
      </Card>
    </>
  );
}

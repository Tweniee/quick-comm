'use client';
import { useState } from 'react';
import { Card, ErrorBox, PageHead, usePoll } from '@/components/ui';
import { api, dt } from '@/lib/api';

const mask = (k: string) => `${k.slice(0, 8)}••••${k.slice(-4)}`;

/** B19 · API access. Keys are created here once Tweniee has whitelisted the business. */
export default function ApiPage() {
  const me = usePoll(() => api('/business/me', { kind: 'business' }), 60000);
  const keys = usePoll(() => api('/business/api-keys', { kind: 'business' }).catch(() => []), 60000);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const [secret, setSecret] = useState<any>(null);
  const [hook, setHook] = useState('');
  const run = async (fn: () => Promise<unknown>, msg: string) => { setError(null); setOk(''); try { await fn(); setOk(msg); await me.reload(); await keys.reload(); } catch (e) { setError(e); } };
  const b = me.data;
  if (!b) return <ErrorBox error={me.error} />;
  const active = (keys.data ?? []).filter((k: any) => k.active);
  const test = active.find((k: any) => k.mode === 'TEST');
  const live = active.find((k: any) => k.mode === 'LIVE');
  return (
    <>
      <PageHead title={<>API &amp; webhooks {b.apiEnabled ? <span className="badge s-ACTIVE">Whitelisted</span> : <span className="badge">Not enabled</span>}</>} sub="Create orders from your website or POS. Same statuses as the app, version v1." />
      <ErrorBox error={error} />
      {ok && <div className="alert ok"><span>{ok}</span></div>}
      {!b.apiEnabled ? (
        <Card title="Request API access">
          <p className="small" style={{ marginTop: 0 }}>API access is given to approved businesses on request. Tell us what you want to connect (Shopify, WooCommerce, your own POS).</p>
          <button disabled={b.status !== 'APPROVED'} onClick={() => run(() => api('/business/tickets', { kind: 'business', body: { type: 'API_ACCESS', subject: 'API access request', body: prompt('What do you want to connect?') || 'Please enable API access.' } }), 'Request sent. Support will reply in Support.')}>Request access</button>
        </Card>
      ) : (
        <>
          {secret?.secret && <div className="alert warn" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><b>Copy now. The secret is shown only once.</b><code>key {secret.keyId}</code><code>secret {secret.secret}</code></div>}
          {secret?.webhookSecret && <div className="alert warn"><span>Webhook signing secret (shown once): <code>{secret.webhookSecret}</code></span></div>}
          <div className="list">
            {[['TEST', 'Test key', test, 'Sandbox'], ['LIVE', 'Live key', live, 'Real riders, real wallet']].map(([mode, label, k, hint]: any) => (
              <div key={mode} className="item" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><b>{label}</b><div className="mono small">{k ? mask(k.keyId) : 'Not created'}</div><div className="small muted">{hint}{k?.lastUsedAt ? ` · last used ${dt(k.lastUsedAt)}` : ''}</div></span>
                {k ? <button className="link" onClick={() => confirm('Revoke this key? It stops working immediately.') && run(() => api(`/business/api-keys/${k.id}`, { kind: 'business', method: 'DELETE' }), 'Key revoked')}>Revoke</button>
                  : <button className="secondary" onClick={() => run(async () => setSecret(await api('/business/api-keys', { kind: 'business', body: { mode } })), `${label} created`)}>Create</button>}
              </div>
            ))}
          </div>
          <p className="note">A key is shown in full only once, when it is created.</p>
          <Card title="Webhook URL · HTTPS only">
            <div className="row">
              <input style={{ flex: 1 }} placeholder={b.webhookUrl ?? 'https://your-shop.com/tweniee-webhook'} value={hook} onChange={(e) => setHook(e.target.value)} />
              <button onClick={() => run(async () => setSecret(await api('/business/webhook', { kind: 'business', body: { url: hook } })), 'Webhook saved')}>Save</button>
              {b.webhookSecretSet && <button className="secondary" onClick={() => run(async () => setSecret(await api('/business/webhook/rotate-secret', { kind: 'business', body: {} })), 'Secret rotated')}>Rotate secret</button>}
            </div>
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Current</dt><dd className="small">{b.webhookUrl ?? 'Not set'}</dd>
              <dt>Rate limit</dt><dd>{b.rateLimitPerMin} / min · {b.rateLimitPerDay.toLocaleString('en-IN')} / day</dd>
              <dt>Events</dt><dd>Every status change, signed with X-TW-Signature</dd>
            </dl>
          </Card>
          <div className="card soft"><b>Idempotent</b><p className="small" style={{ margin: '4px 0 0' }}>Send your own reference ID on every create call. A retry returns the first order, never a second charge.</p></div>
          <a className="btn secondary" href="https://github.com/Tweniee/quick-comm/blob/main/docs/api.md" target="_blank" rel="noreferrer">API docs</a>
        </>
      )}
    </>
  );
}

'use client';
import { useState } from 'react';
import { Card, ErrorBox, usePoll } from '@/components/ui';
import { api, dt } from '@/lib/api';

export default function System() {
  const hooks = usePoll(() => api('/admin/webhooks/failed', { kind: 'admin' }), 30000);
  const staff = usePoll(() => api('/admin/staff', { kind: 'admin' }).catch(() => null), 60000);
  const [f, setF] = useState<Record<string, string>>({ role: 'SUPPORT' });
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await hooks.reload(); await staff.reload(); } catch (e) { setError(e); } };
  return (
    <>
      <h1>Webhooks & staff</h1>
      <ErrorBox error={error} />
      <Card title="Failed webhooks (after 3 retries)">
        {(hooks.data ?? []).length === 0 ? <p className="muted">None.</p> : (
          <table><tbody>{hooks.data.map((h: any) => (
            <tr key={h.id}><td className="small">{dt(h.createdAt)}</td><td>{h.event}</td><td className="small mono">{h.url}</td><td className="small">{h.lastError}</td><td><button className="link" onClick={() => run(() => api(`/admin/webhooks/${h.id}/retry`, { kind: 'admin', body: {} }))}>Retry</button></td></tr>
          ))}</tbody></table>
        )}
      </Card>
      {staff.data && (
        <Card title="Staff accounts (no shared logins)">
          <table><tbody>{staff.data.map((s: any) => (
            <tr key={s.id}><td>{s.name}</td><td>{s.email}</td><td>{s.role}</td><td>{s.active ? 'Active' : 'Inactive'}</td>
              <td><button className="link" onClick={() => run(() => api(`/admin/staff/${s.id}/active`, { kind: 'admin', body: { active: !s.active } }))}>{s.active ? 'Deactivate' : 'Activate'}</button></td></tr>
          ))}</tbody></table>
          <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/staff', { kind: 'admin', body: f })); }}>
            <input required placeholder="Name" style={{ width: 150 }} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input required type="email" placeholder="Email" style={{ width: 200 }} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input required type="password" placeholder="Password (10+ chars)" style={{ width: 180 }} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <select style={{ width: 150 }} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option>SUPPORT</option><option>STAFF</option><option>SUPER_ADMIN</option></select>
            <button>Add staff</button>
          </form>
        </Card>
      )}
    </>
  );
}

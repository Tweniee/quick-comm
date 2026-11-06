'use client';
import { useState } from 'react';
import { Chips, ErrorBox, PageHead, usePoll } from '@/components/ui';
import { api, rupees, tm } from '@/lib/api';

type Cat = '' | 'wallet' | 'approvals' | 'pricing' | 'documents';
const ACTION: Record<string, string> = {
  WALLET_ADJUST: 'Wallet adjustment', WALLET_CREDIT: 'Wallet credit', BUSINESS_APPROVE: 'Business approved', BUSINESS_REJECT: 'Business rejected', BUSINESS_SUSPEND: 'Business suspended',
  BUSINESS_REQUEST_REUPLOAD: 'Re-upload asked', DRIVER_APPROVE: 'Driver approved', DRIVER_REJECT: 'Driver rejected', DRIVER_INVITE: 'Driver invited', PRICING_SET: 'Price set',
  CITY_PAUSE: 'City paused', CITY_UPDATE: 'City updated', DOCUMENT_VIEW: 'Viewed document', API_ACCESS: 'API access changed',
};
const label = (a: string) => ACTION[a] ?? a.toLowerCase().replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase());

function change(r: any) {
  const o = r.oldValue ?? {}, n = r.newValue ?? {};
  if (n.deliveryFee != null) return `Delivery ${rupees(n.deliveryFee)} · Return ${rupees(n.returnFee)}`;
  if (n.amount != null) return `${n.amount > 0 ? '+' : '−'}${rupees(Math.abs(n.amount))}${n.balanceAfter != null ? ` · → ${rupees(n.balanceAfter)}` : ''}`;
  if (o.status || n.status) return `${(o.status ?? '—').toLowerCase()} → ${(n.status ?? '—').toLowerCase()}`;
  return '—';
}

/** A15 · Audit log. Append-only; nothing here can be edited. */
export default function Audit() {
  const [cat, setCat] = useState<Cat>('');
  const r = usePoll(() => api(`/admin/views/audit?category=${cat}`, { kind: 'admin' }), 30000, [cat]);
  const csv = () => {
    const rows = [['when', 'who', 'action', 'entity', 'change', 'reason', 'ip'], ...(r.data ?? []).map((x: any) => [x.createdAt, x.actor, x.action, `${x.entity} ${x.entityId ?? ''}`, change(x), x.reason ?? '', x.ip ?? ''])];
    const blob = new Blob([rows.map((row) => row.map((v: unknown) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'audit-log.csv'; a.click();
  };
  return (
    <>
      <PageHead title="Audit log" right={<button className="secondary" onClick={csv}>Export CSV</button>} />
      <Chips<Cat> value={cat} onChange={setCat} options={[{ value: '', label: 'All actions' }, { value: 'wallet', label: 'Wallet' }, { value: 'approvals', label: 'Approvals' }, { value: 'pricing', label: 'Pricing & city' }, { value: 'documents', label: 'Document views' }]} />
      <ErrorBox error={r.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Change</th><th>Reason</th></tr></thead>
          <tbody>
            {(r.data ?? []).map((x: any) => (
              <tr key={x.id}>
                <td className="small">{new Date(x.createdAt).toDateString() === new Date().toDateString() ? tm(x.createdAt) : new Date(x.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                <td className="small">{x.actor}</td>
                <td>{label(x.action)}</td>
                <td className="small">{x.entityName ?? x.entity}</td>
                <td className="small">{change(x)}</td>
                <td className="small">{x.reason ?? '—'}</td>
              </tr>
            ))}
            {r.data && !r.data.length && <tr><td colSpan={6} className="muted">Nothing logged in this category yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">Every admin action and every document view is logged with who, when, what changed, why and IP. Entries can&apos;t be edited or deleted.</p>
    </>
  );
}

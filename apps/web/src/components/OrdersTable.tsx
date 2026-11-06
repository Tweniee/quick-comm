'use client';
import Link from 'next/link';
import { dt } from '@/lib/api';
import { Empty, StatusBadge } from './ui';

export function OrdersTable({ items, base, showBusiness }: { items: any[]; base: string; showBusiness?: boolean }) {
  if (!items?.length) return <Empty>No orders yet.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Order</th>{showBusiness && <th>Business</th>}<th>Customer</th><th>Status</th><th>Rider</th><th>Created</th></tr></thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.id}>
              <td><Link href={`${base}/${o.id}`} className="mono">{o.code}</Link>{o.isTest && <span className="badge" style={{ marginLeft: 6 }}>TEST</span>}{o.flags?.length ? <span title={o.flags.join(', ')}> ⚑</span> : null}</td>
              {showBusiness && <td>{o.businessName}</td>}
              <td>{o.customer.name}<div className="muted small">{o.customer.phone}</div></td>
              <td><StatusBadge status={o.status} /></td>
              <td>{o.rider?.firstName ?? '—'}</td>
              <td className="small">{dt(o.times.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

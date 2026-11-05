'use client';
import { useState } from 'react';
import { Card, ErrorBox, usePoll } from '@/components/ui';
import { api, dt } from '@/lib/api';

export default function Audit() {
  const [entity, setEntity] = useState('');
  const list = usePoll(() => api(`/admin/audit-log?take=300${entity ? `&entity=${entity}` : ''}`, { kind: 'admin' }), 30000, [entity]);
  return (
    <>
      <h1>Audit log</h1>
      <div className="tabs">{['', 'Business', 'Driver', 'City', 'ApiKey', 'DriverPayout', 'AdminUser'].map((e) => <button key={e} className={entity === e ? 'on' : ''} onClick={() => setEntity(e)}>{e || 'All'}</button>)}</div>
      <ErrorBox error={list.error} />
      <Card>
        <div className="table-wrap"><table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Change</th><th>Reason</th></tr></thead>
          <tbody>{(list.data ?? []).map((a: any) => (
            <tr key={a.id}><td className="small">{dt(a.createdAt)}</td><td className="small">{a.actorType} {a.actorId?.slice(-6)}</td><td>{a.action}</td><td className="small mono">{a.entity} {a.entityId.slice(-8)}</td>
              <td className="small mono" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.oldValue ? `${JSON.stringify(a.oldValue)} → ` : ''}{a.newValue ? JSON.stringify(a.newValue) : ''}</td><td className="small">{a.reason}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>
    </>
  );
}

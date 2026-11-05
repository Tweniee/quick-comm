'use client';
import { api } from '@/lib/api';

/** Opens a private document via a signed, expiring URL (each view is logged server-side). */
export function DocLink({ id, label }: { id: string; label: string }) {
  return (
    <button className="link" onClick={async () => {
      const r = await api(`/admin/documents/${id}/url`, { kind: 'admin' });
      window.open(`/api${r.url}`, '_blank', 'noopener');
    }}>{label}</button>
  );
}

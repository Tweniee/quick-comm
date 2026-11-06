'use client';

export type Kind = 'admin' | 'business';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public nextAction?: string, public details?: unknown) {
    super(message);
  }
}

export const session = {
  get(kind: Kind): string | null {
    try { return localStorage.getItem(`qd.${kind}.token`); } catch { return null; }
  },
  set(kind: Kind, token: string, meta?: unknown) {
    try {
      localStorage.setItem(`qd.${kind}.token`, token);
      if (meta) localStorage.setItem(`qd.${kind}.meta`, JSON.stringify(meta));
    } catch { /* storage unavailable */ }
  },
  meta<T = Record<string, unknown>>(kind: Kind): T | null {
    try { return JSON.parse(localStorage.getItem(`qd.${kind}.meta`) || 'null'); } catch { return null; }
  },
  clear(kind: Kind) {
    try { localStorage.removeItem(`qd.${kind}.token`); localStorage.removeItem(`qd.${kind}.meta`); } catch { /* ignore */ }
  },
};

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; kind?: Kind; form?: FormData; raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = opts.kind ? session.get(opts.kind) : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && opts.kind && typeof window !== 'undefined') {
    session.clear(opts.kind);
    if (!location.pathname.endsWith('/login')) location.href = `/${opts.kind}/login`;
  }
  if (opts.raw) return (await res.text()) as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? data?.message ?? 'Something went wrong. Please retry.', e.nextAction, e.details);
  }
  return data as T;
}

export const rupees = (paise?: number | null) =>
  paise == null ? '—' : `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: paise % 100 ? 2 : 0 })}`;

export const dt = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const STATUS_LABEL: Record<string, string> = {
  CREATED: 'Created', READY: 'Ready', ASSIGNING: 'Assigning', NO_RIDER: 'No Rider', ASSIGNED: 'Assigned', PICKED_UP: 'Picked Up',
  OUT_FOR_DELIVERY: 'Out for Delivery', ARRIVED: 'Arrived', DELIVERED: 'Delivered', UNDELIVERED: 'Undelivered',
  RETURNING: 'Returning', RETURNED: 'Returned', CANCELLED: 'Cancelled',
};

/** "3:41 pm" */
export const tm = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : '—';

/** "22 min", "5 h", "1 day" since a time. */
export const ago = (d?: string | Date | null) => {
  if (!d) return '—';
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  const days = Math.round(m / 1440);
  return `${days} day${days > 1 ? 's' : ''}`;
};

export const dateOnly = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const LEDGER_LABEL: Record<string, string> = {
  RECHARGE: 'Recharge', HOLD: 'Held', RELEASE: 'Hold released', FORWARD_CHARGE: 'Forward', RETURN_CHARGE: 'Return',
  CREDIT: 'Credit', REFUND: 'Refund', DEBIT_ADJUSTMENT: 'Adjustment',
};
/** +1 adds to the balance, -1 takes from it, 0 only moves money in or out of "held". Ledger amounts are stored positive. */
export const ledgerSign = (type: string) => (['RECHARGE', 'CREDIT', 'REFUND'].includes(type) ? 1 : ['FORWARD_CHARGE', 'RETURN_CHARGE', 'DEBIT_ADJUSTMENT'].includes(type) ? -1 : 0);
export const ledgerAmount = (type: string, amount: number) => { const s = ledgerSign(type); return `${s > 0 ? '+' : s < 0 ? '−' : ''}${rupees(Math.abs(amount))}`; };

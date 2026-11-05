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

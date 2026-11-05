'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { ApiError, Kind, session, STATUS_LABEL } from '@/lib/api';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge s-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function ErrorBox({ error, actions }: { error: unknown; actions?: Partial<Record<string, ReactNode>> }) {
  if (!error) return null;
  const e = error as ApiError;
  return (
    <div className="alert error" role="alert">
      <span>{e.message ?? String(error)}</span>
      {e.nextAction && actions?.[e.nextAction]}
    </div>
  );
}

export function Card({ title, children, right }: { title?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      {(title || right) && <div className="card-head"><h3>{title}</h3>{right}</div>}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warn' | 'ok' | 'bad' }) {
  return <div className={`stat ${tone ?? ''}`}><div className="stat-v">{value}</div><div className="stat-l">{label}</div></div>;
}

export function Shell({ kind, nav, children }: { kind: Kind; nav: { href: string; label: string }[]; children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const meta = typeof window !== 'undefined' ? session.meta<{ name?: string; business?: { name: string; status: string }; user?: { name: string; role: string } }>(kind) : null;
  useEffect(() => {
    if (!session.get(kind)) router.replace(`/${kind}/login`);
    else setReady(true);
  }, [kind, router]);
  if (!ready) return null;
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Quick<span>Delivery</span><small>{kind === 'admin' ? 'Operations' : 'Business'}</small></div>
        <nav>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href || (n.href !== `/${kind}` && path.startsWith(n.href)) ? 'active' : ''}>{n.label}</Link>
          ))}
        </nav>
        <div className="side-foot">
          <div className="muted small">{meta?.business?.name ?? meta?.user?.name}</div>
          <button className="link" onClick={() => { session.clear(kind); router.replace(`/${kind}/login`); }}>Log out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

/** Polls a loader (works on flaky networks; masterplan: never rely on sockets alone). */
export function usePoll<T>(load: () => Promise<T>, ms = 10000, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [at, setAt] = useState<Date | null>(null);
  const reload = async () => {
    try { setData(await load()); setError(null); setAt(new Date()); } catch (e) { setError(e); }
  };
  useEffect(() => {
    reload();
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, reload, lastUpdated: at };
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

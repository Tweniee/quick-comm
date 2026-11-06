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

export type NavItem = { href: string; label: string } | { section: string };

export function Logo({ size }: { size?: 'lg' }) {
  return <div className={`logo ${size ?? ''}`} aria-hidden="true">T</div>;
}

export function Shell({ kind, nav, bottomNav, search, children }: { kind: Kind; nav: NavItem[]; bottomNav?: { href: string; label: string }[]; search?: string; children: ReactNode }) {
  const [q, setQ] = useState('');
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const meta = typeof window !== 'undefined' ? session.meta<{ name?: string; business?: { name: string; status: string }; user?: { name: string; role: string } }>(kind) : null;
  useEffect(() => {
    if (!session.get(kind)) router.replace(`/${kind}/login`);
    else setReady(true);
  }, [kind, router]);
  if (!ready) return null;
  const isActive = (href: string) => path === href || (href !== `/${kind}` && path.startsWith(href + '/')) || (href !== `/${kind}` && path === href);
  return (
    <div className={`shell ${kind}`}>
      <aside className="side">
        <div className="brand"><Logo />Tweniee {kind === 'admin' ? 'Admin' : 'Business'}</div>
        <nav aria-label="Main">
          {nav.map((n, i) => 'section' in n
            ? <span key={i} className="section">{n.section}</span>
            : <Link key={n.href} href={n.href} className={isActive(n.href) ? 'active' : ''}>{n.label}</Link>)}
        </nav>
        <div className="side-foot">
          <span>{meta?.business?.name ?? meta?.user?.name}{meta?.user?.role ? ` · ${meta.user.role.replace('_', ' ').toLowerCase()}` : ''}</span>
          <button className="link" onClick={() => { session.clear(kind); router.replace(`/${kind}/login`); }}>Log out</button>
        </div>
      </aside>
      <main className="main">
        {search && (
          <form className="topsearch" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/${kind}/search?q=${encodeURIComponent(q.trim())}`); }}>
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search" placeholder={search} value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
        )}
        {children}
      </main>
      {bottomNav && (
        <nav className="bnav" aria-label="App">
          {bottomNav.map((n) => <Link key={n.href} href={n.href} className={isActive(n.href) ? 'active' : ''}>{n.label}</Link>)}
        </nav>
      )}
    </div>
  );
}

export function PageHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="row between" style={{ alignItems: 'flex-start' }}>
      <div><h1>{title}</h1>{sub && <p className="sub" style={{ margin: 0 }}>{sub}</p>}</div>
      {right && <div className="row">{right}</div>}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="chips" role="tablist">
      {options.map((o) => <button key={o.value} role="tab" aria-selected={value === o.value} className={`chip ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>)}
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

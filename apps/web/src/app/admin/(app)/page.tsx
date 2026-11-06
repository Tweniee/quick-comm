'use client';
import Link from 'next/link';
import { Card, ErrorBox, PageHead, Stat, usePoll } from '@/components/ui';
import { api, session } from '@/lib/api';
import { mapsLink } from '@/lib/geo';

const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const KIND_TONE: Record<string, string> = { NO_RIDER: 'error', WEBHOOK: 'warn', DOCS: 'warn', BUSINESSES: 'info' };

/** A01 · Dashboard: today, live. */
export default function Dashboard() {
  const d = usePoll(() => api('/admin/dashboard', { kind: 'admin' }), 10000);
  const att = usePoll(() => api('/admin/views/attention', { kind: 'admin' }), 15000);
  const map = usePoll(() => api('/admin/live-map', { kind: 'admin' }), 15000);
  const me = typeof window !== 'undefined' ? session.meta<{ user?: { name: string; role: string } }>('admin') : null;
  const x = d.data;
  const online = (x?.riders?.ONLINE ?? 0) + (x?.riders?.BUSY ?? 0);
  const rate = x?.metrics?.assignmentSuccessRate;
  return (
    <>
      <PageHead title="Dashboard" sub={<>{me?.user?.name}{me?.user?.role ? ` · ${me.user.role.replace('_', ' ').toLowerCase()}` : ''} · Today, live</>} />
      <ErrorBox error={d.error} />
      <div className="grid g6">
        <Stat label="Live orders" value={x?.liveOrders ?? '—'} />
        <Stat label="Riders online" value={<>{online}<small className="muted"> / {att.data?.ridersTotal ?? '—'}</small></>} />
        <Stat label="Ready, no rider" value={x?.unassigned?.filter((o: any) => o.status === 'NO_RIDER').length ?? 0} tone={x?.unassigned?.some((o: any) => o.status === 'NO_RIDER') ? 'bad' : undefined} />
        <Stat label="Assignment success" value={<>{pct(rate)}<div className="stat-h">peak target 85%</div></>} tone={rate != null ? (rate < 0.85 ? 'bad' : 'ok') : undefined} />
        <Stat label="Tickets open" value={x?.openTickets ?? '—'} tone={x?.openTickets ? 'warn' : undefined} />
        <Stat label="Wallets under ₹200" value={x?.lowBalanceBusinesses?.length ?? 0} tone={x?.lowBalanceBusinesses?.length ? 'warn' : undefined} />
      </div>
      <div className="grid g2">
        <Card title="Riders and ready orders" right={<span className="small muted">● Rider busy ● Rider free ■ Ready order ■ No rider</span>}>
          <div className="list">
            {(map.data?.riders ?? []).map((r: any) => (
              <div key={r.id} className="row between small">
                <Link href={`/admin/drivers/${r.id}`}><span style={{ color: r.availability === 'BUSY' ? 'var(--violet)' : 'var(--ok)' }}>●</span> {r.name}</Link>
                <span>{r.availability === 'BUSY' ? 'Busy' : 'Free'} · {r.lastLat ? <a href={mapsLink(r.lastLat, r.lastLng)} target="_blank" rel="noreferrer">location</a> : 'no GPS'}</span>
              </div>
            ))}
            {(x?.unassigned ?? []).map((o: any) => (
              <div key={o.id} className="row between small">
                <Link href={`/admin/orders/${o.id}`}><span style={{ color: o.status === 'NO_RIDER' ? 'var(--bad)' : 'var(--blue)' }}>■</span> {o.code} · {o.business.name}</Link>
                <span>{o.status === 'NO_RIDER' ? 'No rider' : 'Ready'}</span>
              </div>
            ))}
            {!map.data?.riders?.length && !x?.unassigned?.length && <p className="muted">No riders online and no orders waiting.</p>}
          </div>
        </Card>
        <Card title="Needs attention">
          <div className="list">
            {(att.data?.items ?? []).map((i: any, n: number) => (
              <Link key={n} href={i.href} className={`alert ${KIND_TONE[i.kind] ?? 'info'}`} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <b>{i.title}</b><span className="small">{i.detail}</span>
              </Link>
            ))}
            {att.data && !att.data.items.length && <p className="muted">Nothing needs you right now.</p>}
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            {x?.failedWebhooks ? `${x.failedWebhooks} failed webhooks · ` : ''}Assignment · SMS · WhatsApp · Maps · Payments: {d.error ? 'check connection' : 'all normal'}
          </p>
        </Card>
      </div>
    </>
  );
}

'use client';
import { Shell } from '@/components/ui';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/businesses', label: 'Businesses' },
  { href: '/admin/drivers', label: 'Drivers' },
  { href: '/admin/tickets', label: 'Support tickets' },
  { href: '/admin/payouts', label: 'Driver payouts' },
  { href: '/admin/cities', label: 'Cities & pricing' },
  { href: '/admin/audit', label: 'Audit log' },
  { href: '/admin/system', label: 'Webhooks & staff' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Shell kind="admin" nav={NAV}>{children}</Shell>;
}

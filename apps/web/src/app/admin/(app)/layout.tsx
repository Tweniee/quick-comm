'use client';
import { NavItem, Shell } from '@/components/ui';

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/tickets', label: 'Support tickets' },
  { href: '/admin/businesses', label: 'Businesses' },
  { href: '/admin/api', label: 'API & webhooks' },
  { href: '/admin/drivers', label: 'Drivers' },
  { href: '/admin/onboarding', label: 'Driver onboarding' },
  { href: '/admin/payouts', label: 'Payouts' },
  { section: 'SUPER ADMIN' },
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/cities', label: 'Cities' },
  { href: '/admin/audit', label: 'Audit log' },
  { href: '/admin/system', label: 'Staff & notifications' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Shell kind="admin" nav={NAV} search="Search phone, order ID, business or rider">{children}</Shell>;
}

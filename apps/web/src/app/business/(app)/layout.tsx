'use client';
import { NavItem, Shell } from '@/components/ui';

const NAV: NavItem[] = [
  { href: '/business', label: 'Home' },
  { href: '/business/orders/new', label: 'New delivery' },
  { href: '/business/orders', label: 'Orders' },
  { href: '/business/wallet', label: 'Wallet' },
  { href: '/business/branches', label: 'Branches & team' },
  { href: '/business/support', label: 'Support' },
  { href: '/business/api', label: 'API' },
];
const BOTTOM = [
  { href: '/business', label: 'Home' },
  { href: '/business/wallet', label: 'Wallet' },
  { href: '/business/branches', label: 'Branches' },
  { href: '/business/support', label: 'Support' },
  { href: '/business/api', label: 'API' },
];

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <Shell kind="business" nav={NAV} bottomNav={BOTTOM}>{children}</Shell>;
}

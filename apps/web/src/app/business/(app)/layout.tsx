'use client';
import { Shell } from '@/components/ui';

const NAV = [
  { href: '/business', label: 'Home' },
  { href: '/business/orders/new', label: 'New order' },
  { href: '/business/orders', label: 'Orders' },
  { href: '/business/wallet', label: 'Wallet' },
  { href: '/business/settings', label: 'Settings & API' },
  { href: '/business/support', label: 'Support' },
];

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <Shell kind="business" nav={NAV}>{children}</Shell>;
}

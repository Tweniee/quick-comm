'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Old Settings page: branches, team and API now have their own tabs. */
export default function Settings() {
  const router = useRouter();
  useEffect(() => { router.replace('/business/branches'); }, [router]);
  return null;
}

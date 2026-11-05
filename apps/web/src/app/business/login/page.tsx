'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorBox } from '@/components/ui';
import { api, session } from '@/lib/api';

export default function BusinessLogin() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth">
      <h1>Business login</h1>
      <ErrorBox error={error} />
      <form className="form card" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try {
          const r = await api('/auth/business/login', { body: { login, password } });
          session.set('business', r.token, { user: r.user, business: r.business });
          router.push('/business');
        } catch (err) { setError(err); } finally { setBusy(false); }
      }}>
        <label>Phone or email<input value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
        <button disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="muted">New business? <Link href="/business/signup">Sign up and get verified</Link></p>
    </div>
  );
}

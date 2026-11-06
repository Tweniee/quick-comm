'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorBox, Logo } from '@/components/ui';
import { api, session } from '@/lib/api';

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="auth">
      <div className="row" style={{ gap: 10 }}><Logo size="lg" /><b style={{ fontSize: 18 }}>Tweniee Admin</b></div>
      <h1>Operations login</h1>
      <ErrorBox error={error} />
      <form className="card form" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try { const r = await api('/auth/admin/login', { body: { email, password } }); session.set('admin', r.token, { user: r.user }); router.push('/admin'); } catch (err) { setError(err); }
      }}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button>Log in</button>
      </form>
    </div>
  );
}

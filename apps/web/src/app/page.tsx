import Link from 'next/link';
import { Logo } from '@/components/ui';

export default function Home() {
  return (
    <div className="auth" style={{ maxWidth: 640 }}>
      <div className="row" style={{ gap: 12 }}><Logo size="lg" /><h1 style={{ margin: 0 }}>Tweniee</h1></div>
      <p className="muted">Intracity bike delivery for verified local businesses. Prepaid wallet, OTP on every delivery, honest live status, no time promise.</p>
      <div className="grid g2">
        <div className="card">
          <h3>For businesses</h3>
          <p className="muted small">Create orders, mark Ready, track riders, manage your wallet and API keys.</p>
          <div className="row"><Link className="btn" href="/business/login">Log in</Link><Link className="btn secondary" href="/business/signup">Sign up</Link></div>
        </div>
        <div className="card">
          <h3>Operations</h3>
          <p className="muted small">Staff, support and Super Admin console.</p>
          <Link className="btn" href="/admin/login">Staff login</Link>
        </div>
      </div>
    </div>
  );
}

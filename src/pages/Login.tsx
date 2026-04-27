import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Shield, Mail, Lock, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { isConfigured } from '../lib/supabase';
import { useState } from 'react';

export default function Login() {
  const { user, role, loading, signInWithEmail, signOut, error: authError, refreshRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localLoading, setLocalLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLocalLoading(true);
    await signInWithEmail(email, password);
    setLocalLoading(false);
  };

  if (!isConfigured) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo"><Shield size={28} /></div>
          <h1>Contour Admin</h1>
          <div className="login-unauthorized">
            <strong>⚠️ .env not configured</strong><br />
            Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="login-page">
        <div className="loading-state">
          <div className="spinner" />
          <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Checking session…
          </p>
        </div>
      </div>
    );
  }

  // Logged in with a valid admin role → go to dashboard
  if (user && role && ['admin', 'superadmin', 'analyst'].includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Logged in but no admin role
  if (user && !role) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo"><Shield size={28} /></div>
          <h1>Contour Admin</h1>
          <div className="login-unauthorized">
            <div style={{ color: '#ff4d4d', fontWeight: 600, fontSize: '1.05rem', marginBottom: 8 }}>
              Access Denied
            </div>
            <p style={{ fontSize: '0.88rem', marginBottom: 20 }}>
              <strong>{user.email}</strong> is not configured as an admin.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-primary" style={{ gap: 8 }} onClick={refreshRole}>
                <RefreshCw size={15} /> Re-check Permissions
              </button>
              <button
                onClick={signOut}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text-primary)',
                  padding: '10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo"><Shield size={28} /></div>
        <h1>Contour Admin</h1>
        <p>Sign in to access the admin dashboard</p>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-with-icon">
              <Mail size={18} className="input-icon" />
              <input
                id="admin-email"
                type="email"
                className="input-field"
                placeholder="admin@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Password</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input
                id="admin-password"
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          {authError && (
            <div className="auth-error" style={{ marginTop: 12 }}>
              <AlertCircle size={15} />
              <span>{authError}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={localLoading || !email || !password}
            style={{ marginTop: 24, width: '100%' }}
          >
            {localLoading ? (
              <><Loader2 size={16} className="animate-spin" /> Signing in…</>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

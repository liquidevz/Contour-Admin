import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { isConfigured } from '../lib/supabase';
import { useState } from 'react';

export default function Login() {
  const { user, role, loading, signInWithGoogle, signOut } = useAuth();
  const [showDebug, setShowDebug] = useState(false);

  if (!isConfigured) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <Shield size={28} />
          </div>
          <h1>Contour Admin</h1>
          <p>Sign in to access the admin dashboard</p>
          <div className="login-unauthorized" style={{ textAlign: 'left' }}>
            <strong>⚠️ Configuration Required</strong><br /><br />
            Create a <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>.env</code> file in the project root with:<br /><br />
            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: 4, display: 'block', fontSize: '0.78rem', lineHeight: 1.8 }}>
              VITE_SUPABASE_URL=https://your-instance.supabase.co<br />
              VITE_SUPABASE_ANON_KEY=your-anon-key
            </code>
            <br />Then restart the dev server.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="login-page">
        <div className="loading-state"><div className="spinner" /></div>
      </div>
    );
  }

  if (user && role && ['admin', 'superadmin'].includes(role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <Shield size={28} />
        </div>
        <h1>Contour Admin</h1>
        <p>Sign in to access the admin dashboard</p>

        {user && !['admin', 'superadmin'].includes(role || '') ? (
          <div className="login-unauthorized">
            <strong>Access Denied</strong><br />
            Your account ({user.email}) does not have admin privileges.
            Contact a superadmin to get access.
            <br /><br />
            <button
              onClick={signOut}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'inherit',
                padding: '8px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Sign out & try another account
            </button>
            <br />
            <button
              onClick={() => setShowDebug(!showDebug)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted, #888)',
                cursor: 'pointer',
                fontSize: '0.72rem',
                marginTop: 12,
                textDecoration: 'underline',
              }}
            >
              {showDebug ? 'Hide' : 'Show'} debug info
            </button>
            {showDebug && (
              <div style={{
                marginTop: 12,
                padding: 12,
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 8,
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                textAlign: 'left',
                wordBreak: 'break-all',
              }}>
                <div><strong>User ID:</strong> {user.id}</div>
                <div><strong>Email:</strong> {user.email}</div>
                <div><strong>Role:</strong> {role ?? 'null (not found)'}</div>
                <div><strong>Origin:</strong> {window.location.origin}</div>
                <div><strong>Configured:</strong> {String(isConfigured)}</div>
              </div>
            )}
          </div>
        ) : (
          <button className="google-btn" onClick={signInWithGoogle}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        )}
      </div>
    </div>
  );
}

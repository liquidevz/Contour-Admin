import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Shield, Mail, Lock, AlertCircle, Loader2, RefreshCw, Terminal } from 'lucide-react';
import { isConfigured } from '../lib/supabase';
import { useState } from 'react';

export default function Login() {
  const { user, role, loading: authLoading, signInWithEmail, signOut, error: authError, debugLog, refreshRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLocalLoading(true);
    try {
      await signInWithEmail(email, password);
    } finally {
      setLocalLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo"><Shield size={28} /></div>
          <h1>Contour Admin</h1>
          <div className="login-unauthorized" style={{ textAlign: 'left' }}>
            <strong>⚠️ Configuration Required</strong><br /><br />
            Check your <code className="mono">.env</code> file configuration.
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="login-page">
        <div className="loading-state">
          <div className="spinner" />
          <p style={{ marginTop: 20, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Verifying permissions...</p>
        </div>
      </div>
    );
  }

  if (user && role && ['admin', 'superadmin'].includes(role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo"><Shield size={28} /></div>
        <h1>Contour Admin</h1>
        <p>Sign in to access the admin dashboard</p>

        {user && !['admin', 'superadmin'].includes(role || '') ? (
          <div className="login-unauthorized">
            <div style={{ color: '#ff4d4d', fontWeight: 600, fontSize: '1.1rem', marginBottom: 8 }}>Access Denied</div>
            <p style={{ fontSize: '0.9rem', marginBottom: 20 }}>
              Your account (<strong>{user.email}</strong>) is authenticated but does not have an admin role assigned in the database.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button className="btn btn-primary" onClick={() => refreshRole()} style={{ width: '100%', gap: 8 }}>
                <RefreshCw size={16} /> Re-check My Role
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
                  fontSize: '0.85rem'
                }}
              >
                Sign out & try another account
              </button>
            </div>

            <button
              onClick={() => setShowDebug(!showDebug)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                marginTop: 20,
                textDecoration: 'underline',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginInline: 'auto'
              }}
            >
              <Terminal size={12} /> {showDebug ? 'Hide' : 'Show'} detailed debug logs
            </button>

            {showDebug && (
              <div style={{
                marginTop: 15,
                padding: 12,
                background: '#000',
                borderRadius: 8,
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                textAlign: 'left',
                border: '1px solid #333',
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                <div style={{ color: '#4ade80', marginBottom: 8, borderBottom: '1px solid #333', paddingBottom: 4 }}>
                  SESSION DEBUG INFO
                </div>
                <div>ID: {user.id}</div>
                <div>ROLE: {role || 'null'}</div>
                <div style={{ color: '#fbbf24', marginTop: 10, marginBottom: 4 }}>EVENT LOG:</div>
                {debugLog.map((log, i) => (
                  <div key={i} style={{ opacity: 0.8, marginBottom: 2 }}>{log}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div className="input-with-icon">
                <Mail size={18} className="input-icon" />
                <input
                  type="email"
                  className="input-field"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 16 }}>
              <label className="form-label">Password</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {authError && (
              <div className="auth-error">
                <AlertCircle size={16} />
                <span>{authError}</span>
              </div>
            )}

            <button 
              type="submit" 
              className="btn btn-primary login-submit"
              disabled={localLoading || !email || !password}
              style={{ marginTop: 24 }}
            >
              {localLoading ? (
                <><Loader2 size={18} className="animate-spin" /> Signing in...</>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}


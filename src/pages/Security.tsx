/**
 * Security — admin account security controls.
 *
 * Today: TOTP factor enrollment + listing + unenroll.
 * Future home for password reset, session revocation, recovery codes.
 *
 * Supabase MFA exposes:
 *   - mfa.enroll({ factorType: 'totp' }) → returns secret + qr_code (SVG)
 *   - mfa.challenge({ factorId })        → returns challengeId
 *   - mfa.verify({ factorId, challengeId, code }) → flips factor to 'verified'
 *   - mfa.unenroll({ factorId })
 *
 * Until a factor is `verified`, Supabase keeps the session at AAL1. Only
 * verified factors trigger the AAL2 challenge wired in AuthContext.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  KeyRound, ShieldCheck, ShieldOff, Plus, Trash2, X, Loader2, AlertTriangle,
} from 'lucide-react';

interface Factor {
  id:           string;
  friendly_name: string | null;
  factor_type:  string;
  status:       'verified' | 'unverified';
  created_at:   string;
}

export default function Security() {
  const { user } = useAuth();
  const [factors, setFactors]   = useState<Factor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [enrolling, setEnroll]  = useState<EnrollState | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) console.warn('[Security] listFactors', error);
    const all = (data?.totp ?? []) as Factor[];
    setFactors(all);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function startEnroll() {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `TOTP ${new Date().toLocaleDateString()}`,
    });
    if (error || !data) { alert(error?.message ?? 'Enrollment failed'); return; }
    setEnroll({
      factorId: data.id,
      qrCode:   data.totp.qr_code,
      secret:   data.totp.secret,
      uri:      data.totp.uri,
    });
  }

  async function unenroll(factorId: string) {
    if (!confirm('Remove this TOTP factor? You will lose 2FA on this account.')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) { alert(error.message); return; }
    await load();
  }

  const verified = factors.filter(f => f.status === 'verified');
  const pending  = factors.filter(f => f.status === 'unverified');

  return (
    <div>
      <div className="page-header">
        <h1>
          <KeyRound size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Security
        </h1>
        <p>Manage two-factor authentication for <code>{user?.email}</code>.</p>
      </div>

      {/* Status strip */}
      <div style={{
        padding: 14, marginBottom: 16, borderRadius: 8,
        background: verified.length ? 'rgba(20,184,166,0.06)' : 'rgba(245,158,11,0.06)',
        border: `1px solid ${verified.length ? 'rgba(20,184,166,0.25)' : 'rgba(245,158,11,0.25)'}`,
        color: verified.length ? '#14B8A6' : '#F59E0B',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {verified.length
          ? <><ShieldCheck size={18} /> <strong>2FA is enabled.</strong> You'll be challenged for a TOTP code on every sign-in.</>
          : <><AlertTriangle size={18} /> <strong>2FA is not enabled.</strong> Add a TOTP factor to require a one-time code on every sign-in.</>
        }
      </div>

      <div className="data-card" style={{ marginBottom: 16 }}>
        <div className="data-card-header">
          <span className="data-card-title">TOTP factors</span>
          <button className="btn btn-primary btn-sm" onClick={() => void startEnroll()}>
            <Plus size={14} /> Enroll authenticator
          </button>
        </div>
        {loading ? <div className="loading-state"><div className="spinner" /></div>
          : factors.length === 0
            ? <div className="empty-state">
                <div className="empty-state-icon"><KeyRound size={24} /></div>
                <h3>No factors enrolled</h3>
                <p>Click "Enroll authenticator" to scan a QR code with Google Authenticator, 1Password, Authy, etc.</p>
              </div>
            : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>State</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Created</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {factors.map(f => (
                      <tr key={f.id}>
                        <td>
                          {f.status === 'verified'
                            ? <span style={badge('#14B8A6')}><ShieldCheck size={11} /> verified</span>
                            : <span style={badge('#F59E0B')}><AlertTriangle size={11} /> unverified</span>}
                        </td>
                        <td style={{ fontSize: 12 }}>{f.friendly_name || '—'}</td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{f.factor_type}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(f.created_at).toLocaleString()}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => void unenroll(f.id)}>
                            <Trash2 size={12} /> Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>

      {pending.length > 0 && (
        <div style={{
          padding: 12, borderRadius: 6, marginBottom: 16,
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.25)',
          color: '#F59E0B', fontSize: 13,
        }}>
          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          You have {pending.length} unverified factor(s). Remove them or re-enroll to complete verification.
        </div>
      )}

      {enrolling && (
        <EnrollModal
          state={enrolling}
          onClose={() => setEnroll(null)}
          onSuccess={async () => { setEnroll(null); await load(); }}
        />
      )}
    </div>
  );
}

// ─── Enrollment modal ────────────────────────────────────────

interface EnrollState {
  factorId: string;
  qrCode:   string;       // raw SVG string from Supabase
  secret:   string;
  uri:      string;
}

function EnrollModal({
  state, onClose, onSuccess,
}: { state: EnrollState; onClose: () => void; onSuccess: () => void }) {
  const [code, setCode]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [showSecret, setShow] = useState(false);

  async function verify() {
    setError(null);
    if (code.length < 6) { setError('Enter the 6-digit code from your app'); return; }
    setBusy(true);
    const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: state.factorId });
    if (chalErr || !chal) { setBusy(false); setError(chalErr?.message ?? 'Challenge failed'); return; }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId:    state.factorId,
      challengeId: chal.id,
      code:        code.trim(),
    });
    setBusy(false);
    if (verifyErr) { setError(verifyErr.message); return; }
    onSuccess();
  }

  async function cancel() {
    // Clean up the unverified factor on cancel so we don't litter
    // the user's account with orphaned enrollments.
    try { await supabase.auth.mfa.unenroll({ factorId: state.factorId }); } catch {}
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={() => void cancel()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2>
            <KeyRound size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Enroll authenticator
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={() => void cancel()}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <ol style={{ paddingLeft: 18, fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            <li>Open your authenticator app (Google Authenticator, 1Password, Authy, …).</li>
            <li>Scan the QR code below.</li>
            <li>Enter the 6-digit code your app shows.</li>
          </ol>

          <div style={{
            background: '#fff', padding: 16, borderRadius: 8,
            display: 'flex', justifyContent: 'center', marginBottom: 12,
          }}
            dangerouslySetInnerHTML={{ __html: state.qrCode }} />

          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 12,
            }}>
            {showSecret ? 'Hide' : 'Show'} secret (manual entry)
          </button>
          {showSecret && (
            <div style={{
              fontFamily: 'monospace', fontSize: 11, padding: 8, borderRadius: 4,
              background: 'var(--bg-secondary, #11111a)',
              border: '1px solid var(--border, #2a2a35)',
              wordBreak: 'break-all', marginBottom: 16,
            }}>
              {state.secret}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Authentication code</label>
            <input
              type="text"
              className="input-field"
              placeholder="123 456"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\s/g, ''))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={8}
              style={{ fontFamily: 'monospace', letterSpacing: 4, fontSize: 18 }}
            />
          </div>

          {error && (
            <div style={{
              marginTop: 12, padding: 10,
              background: 'rgba(255,91,107,0.08)',
              border: '1px solid var(--danger, #ff5b6b)',
              borderRadius: 6, fontSize: 13, color: 'var(--danger, #ff5b6b)',
            }}>{error}</div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => void cancel()} disabled={busy}>
            <ShieldOff size={14} /> Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void verify()} disabled={busy || code.length < 6}>
            {busy
              ? <><Loader2 size={14} className="animate-spin" /> Verifying…</>
              : <><ShieldCheck size={14} /> Verify & enable</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function badge(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 4,
    fontSize: 11, fontWeight: 600,
    background: `${color}22`, color,
  };
}

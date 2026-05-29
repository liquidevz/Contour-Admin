/**
 * ChangePassword — forced first-login screen.
 *
 * Shown to any signed-in user whose `profiles.force_password_change`
 * is true. The gate lives in App.tsx → ProtectedRoute; this screen
 * just owns the form + the two calls:
 *   1. supabase.auth.updateUser({ password }) — user's own JWT.
 *   2. RPC password_change_acknowledge() — flips the flag to false.
 * Then we refresh AuthContext so the gate releases.
 *
 * The same screen is mirrored on mobile (contour/app/(auth)/change-password.tsx)
 * so the behaviour is consistent across surfaces.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, AlertCircle, LogOut, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface Strength {
    score:   0 | 1 | 2 | 3 | 4;
    label:   'too short' | 'weak' | 'fair' | 'good' | 'strong';
    color:   string;
    hints:   string[];
}

function evaluateStrength(pw: string): Strength {
    if (pw.length < 8) {
        return { score: 0, label: 'too short', color: '#ef4444', hints: ['Use at least 8 characters'] };
    }
    let s = 1;
    const hints: string[] = [];
    if (!/[A-Z]/.test(pw)) hints.push('Add an uppercase letter');
    else s++;
    if (!/[a-z]/.test(pw)) hints.push('Add a lowercase letter');
    else s++;
    if (!/\d/.test(pw))    hints.push('Add a number');
    else s++;
    if (pw.length >= 12 && /[^A-Za-z0-9]/.test(pw)) s = Math.min(4, s + 1) as any;

    const score = Math.min(s, 4) as Strength['score'];
    const label = (['weak', 'weak', 'fair', 'good', 'strong'] as const)[score];
    const color = (['#ef4444', '#ef4444', '#f59e0b', '#22c55e', '#10b981'])[score];
    return { score, label, color, hints };
}

export default function ChangePasswordPage() {
    const { user, signOut, refreshRole } = useAuth();
    const navigate = useNavigate();

    const [pw1, setPw1]   = useState('');
    const [pw2, setPw2]   = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState<string | null>(null);

    const strength = evaluateStrength(pw1);
    const mismatch = pw2.length > 0 && pw1 !== pw2;
    const canSubmit = !busy
        && pw1.length >= 8
        && strength.score >= 2
        && pw1 === pw2;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true); setErr(null);
        try {
            const { error: upErr } = await supabase.auth.updateUser({ password: pw1 });
            if (upErr) throw upErr;

            const { error: rpcErr } = await supabase.rpc('password_change_acknowledge');
            if (rpcErr) throw rpcErr;

            // refreshRole re-reads the auth context (which now includes the
            // updated profile flag); the App-level gate will then let them
            // through to /dashboard or /org/dashboard.
            await refreshRole();
            navigate('/', { replace: true });
        } catch (e: any) {
            setErr(e?.message ?? 'Could not update password');
        } finally { setBusy(false); }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-primary, #0a0a0f)',
            padding: 24,
        }}>
            <div style={{
                width: '100%', maxWidth: 440,
                background: 'var(--bg-elevated, #14141c)',
                border: '1px solid var(--border-subtle, #2a2a35)',
                borderRadius: 12, padding: 32,
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: 'rgba(99,102,241,0.15)', color: '#a5a8ff',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <KeyRound size={18} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Set a new password</h1>
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                            Required on first sign-in
                        </p>
                    </div>
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '16px 0', lineHeight: 1.5 }}>
                    Your account was created by an administrator with a temporary
                    password. Choose a permanent one to continue —
                    {user?.email && <> signed in as <strong>{user.email}</strong></>}.
                </p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label className="form-label" htmlFor="pw1">New password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                id="pw1"
                                type={show ? 'text' : 'password'}
                                value={pw1}
                                onChange={(e) => setPw1(e.target.value)}
                                placeholder="At least 8 characters"
                                className="input-field"
                                autoComplete="new-password"
                                autoFocus
                                style={{ paddingRight: 36, width: '100%' }}
                                disabled={busy}
                            />
                            <button
                                type="button"
                                onClick={() => setShow((v) => !v)}
                                style={{
                                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                                    background: 'transparent', border: 'none', color: 'var(--text-muted)',
                                    cursor: 'pointer', padding: 4,
                                }}
                                aria-label={show ? 'Hide password' : 'Show password'}
                            >
                                {show ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {pw1.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${(strength.score / 4) * 100}%`,
                                        height: '100%',
                                        background: strength.color,
                                        transition: 'all 200ms ease',
                                    }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
                                    <span style={{ color: strength.color, textTransform: 'capitalize' }}>
                                        {strength.label}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)' }}>
                                        {strength.hints[0] ?? 'Strong password'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="form-label" htmlFor="pw2">Confirm new password</label>
                        <input
                            id="pw2"
                            type={show ? 'text' : 'password'}
                            value={pw2}
                            onChange={(e) => setPw2(e.target.value)}
                            placeholder="Type it again"
                            className="input-field"
                            autoComplete="new-password"
                            style={{ width: '100%' }}
                            disabled={busy}
                        />
                        {mismatch && (
                            <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertCircle size={12} /> Passwords don't match
                            </div>
                        )}
                        {!mismatch && pw2.length > 0 && pw1 === pw2 && (
                            <div style={{ marginTop: 6, fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircle2 size={12} /> Match
                            </div>
                        )}
                    </div>

                    {err && (
                        <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertCircle size={14} /> {err}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={!canSubmit}
                        style={{ marginTop: 4, justifyContent: 'center' }}
                    >
                        {busy
                            ? <><Loader2 size={14} className="spin" /> <span style={{ marginLeft: 6 }}>Saving…</span></>
                            : 'Set password & continue'}
                    </button>

                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={signOut}
                        style={{ marginTop: 4, color: 'var(--text-muted)', justifyContent: 'center' }}
                        disabled={busy}
                    >
                        <LogOut size={14} /> <span style={{ marginLeft: 6 }}>Sign out instead</span>
                    </button>
                </form>
            </div>
        </div>
    );
}

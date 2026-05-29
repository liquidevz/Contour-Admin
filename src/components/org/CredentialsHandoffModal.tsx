/**
 * CredentialsHandoffModal
 *
 * Shown once after a successful business-user provisioning call (either
 * `provision-business-user` action=create_org from the Organisations page,
 * or action=add_member from Members / Invites). Surfaces the one-time
 * temp password for handoff if the welcome email doesn't land — once the
 * modal closes the password cannot be recovered.
 */

import { useState } from 'react';
import { Check, Copy, KeyRound, X } from 'lucide-react';

export interface CredentialsHandoff {
    org_name: string;
    email: string;
    temp_password: string;
}

export default function CredentialsHandoffModal({
    creds, onClose,
}: {
    creds: CredentialsHandoff | null;
    onClose: () => void;
}) {
    const [copied, setCopied] = useState<'email' | 'password' | null>(null);
    if (!creds) return null;

    const copy = async (val: string, key: 'email' | 'password') => {
        try {
            await navigator.clipboard.writeText(val);
            setCopied(key);
            setTimeout(() => setCopied(null), 1500);
        } catch { /* clipboard may be denied */ }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="modal-header">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <KeyRound size={18} />
                        Credentials for {creds.org_name}
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body">
                    <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                        A welcome email with these credentials was sent. Copy them here as a
                        backup — once you close this dialog the password cannot be recovered.
                    </p>

                    <div style={{
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                        padding: 16,
                        display: 'grid',
                        gap: 12,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '0.86rem',
                    }}>
                        <Row label="Email" value={creds.email} copied={copied === 'email'} onCopy={() => copy(creds.email, 'email')} />
                        <Row label="Password" value={creds.temp_password} copied={copied === 'password'} onCopy={() => copy(creds.temp_password, 'password')} />
                    </div>

                    <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        The user will be forced to set a new password on first sign-in.
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

function Row({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span><strong style={{ color: 'var(--text-secondary)' }}>{label}:</strong> {value}</span>
            <button className="btn btn-ghost btn-sm" onClick={onCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
            </button>
        </div>
    );
}

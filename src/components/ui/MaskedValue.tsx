/**
 * MaskedValue — privacy-aware display for sensitive fields (email, phone, IP).
 *
 * Renders a redacted preview (e.g. "s•••@gmail.com") and reveals the full
 * value on click. The reveal is logged to admin_audit_logs so a senior
 * admin can later review who looked at what.
 *
 * Falls back gracefully when the audit RPC isn't available.
 */

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Kind = 'email' | 'phone' | 'ip' | 'generic';

interface MaskedValueProps {
    value:        string | null | undefined;
    kind?:        Kind;
    auditAction?: string;          // e.g. 'reveal_user_email'
    auditMeta?:   Record<string, unknown>;
    onReveal?:    () => void;
}

export default function MaskedValue({ value, kind = 'generic', auditAction, auditMeta, onReveal }: MaskedValueProps) {
    const [revealed, setRevealed] = useState(false);

    if (!value) return <span className="masked-empty">—</span>;

    const masked = maskByKind(value, kind);

    async function reveal() {
        setRevealed(true);
        onReveal?.();
        if (auditAction) {
            // Log silently — don't block the UI if the table isn't there.
            try {
                await supabase.rpc('admin_audit_log', { p_action: auditAction, p_meta: auditMeta ?? {} });
            } catch {
                /* table may not exist in dev; ignore */
            }
        }
    }

    function hide() { setRevealed(false); }

    return (
        <span className="masked-value">
            <span className="masked-text">{revealed ? value : masked}</span>
            <button
                type="button"
                className="masked-toggle"
                onClick={revealed ? hide : reveal}
                aria-label={revealed ? 'Hide value' : 'Reveal value'}
                title={revealed ? 'Hide' : 'Reveal (logged to audit)'}
            >
                {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
        </span>
    );
}


function maskByKind(value: string, kind: Kind): string {
    switch (kind) {
        case 'email': {
            const at = value.indexOf('@');
            if (at < 1) return '•••';
            const local  = value.slice(0, at);
            const domain = value.slice(at);
            const head   = local.slice(0, 1);
            return head + '•'.repeat(Math.max(1, Math.min(local.length - 1, 4))) + domain;
        }
        case 'phone': {
            const digits = value.replace(/\D/g, '');
            if (digits.length < 4) return '••••';
            const tail = digits.slice(-2);
            return '•••• •• ' + tail;
        }
        case 'ip': {
            const parts = value.split('.');
            if (parts.length === 4) return parts[0] + '.•••.•••.' + parts[3];
            return '•••.•••.•••';
        }
        default: {
            if (value.length <= 4) return '•'.repeat(value.length);
            return value.slice(0, 2) + '•'.repeat(Math.max(2, value.length - 4)) + value.slice(-2);
        }
    }
}

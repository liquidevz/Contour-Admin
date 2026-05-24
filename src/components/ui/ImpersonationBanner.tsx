/**
 * ImpersonationBanner — persistent visual reminder when an admin is acting
 * on behalf of a user.
 *
 * Stores impersonation state in sessionStorage. Other components can call
 * `setImpersonation(userId, displayName)` to enter, or `endImpersonation()`
 * to exit. This banner pins to the top of the viewport when active.
 */

import { useEffect, useState } from 'react';
import { UserCog, X } from 'lucide-react';

const KEY = 'admin.impersonation';

interface State {
    user_id:      string;
    display_name: string;
    started_at:   string;
}

export function setImpersonation(user_id: string, display_name: string) {
    const s: State = { user_id, display_name, started_at: new Date().toISOString() };
    sessionStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event('impersonation-changed'));
}

export function endImpersonation() {
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event('impersonation-changed'));
}

export function useImpersonation(): State | null {
    const [state, setState] = useState<State | null>(read);
    useEffect(() => {
        function onChange() { setState(read()); }
        window.addEventListener('impersonation-changed', onChange);
        window.addEventListener('storage', onChange);
        return () => {
            window.removeEventListener('impersonation-changed', onChange);
            window.removeEventListener('storage', onChange);
        };
    }, []);
    return state;
}

function read(): State | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        return raw ? JSON.parse(raw) as State : null;
    } catch { return null; }
}

export default function ImpersonationBanner() {
    const state = useImpersonation();
    if (!state) return null;

    return (
        <div className="impersonation-banner" role="status">
            <UserCog size={14} />
            <span>
                Acting as <strong>{state.display_name}</strong> — every action is logged.
            </span>
            <button
                type="button"
                className="impersonation-end"
                onClick={endImpersonation}
                aria-label="Stop impersonating"
            >
                Stop <X size={12} />
            </button>
        </div>
    );
}

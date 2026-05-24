/**
 * RoleGate — show children only if the current user has one of the allowed roles.
 *
 * When the user lacks the role, by default the children are simply hidden.
 * Pass `fallback` to show a "view-only" placeholder, or `mode="disable"` to
 * keep the children visible but pointer-event-none + opacity-40 (good for
 * showing a control exists but the user can't act on it).
 */

import type { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';

type Role = 'superadmin' | 'admin' | 'analyst';

interface RoleGateProps {
    role:      Role | Role[];                        // Allowed role(s).
    children:  ReactNode;
    fallback?: ReactNode;
    mode?:     'hide' | 'disable';                   // 'hide' (default) removes from DOM; 'disable' grays out and disables clicks.
}

export default function RoleGate({ role, children, fallback = null, mode = 'hide' }: RoleGateProps) {
    const { role: actual } = useAuth();
    const allowed = Array.isArray(role) ? role : [role];
    const ok = !!actual && allowed.includes(actual as Role);

    if (ok) return <>{children}</>;
    if (mode === 'disable') {
        return (
            <span className="role-gate-disabled" aria-disabled="true" title={`Requires: ${allowed.join(', ')}`}>
                {children}
            </span>
        );
    }
    return <>{fallback}</>;
}

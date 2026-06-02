/**
 * RoleGate — show children only if the current user satisfies a role or
 * capability requirement. Backed by the canonical model in lib/roles.ts.
 *
 *   <RoleGate permission="users.manage">…</RoleGate>   // preferred: gate by capability
 *   <RoleGate role={['admin','superadmin']}>…</RoleGate> // or by explicit role(s)
 *
 * When the user lacks access the children are hidden by default. Pass
 * `fallback` for a "view-only" placeholder, or `mode="disable"` to keep the
 * control visible but pointer-event-none + grayed (shows it exists but is
 * locked). UI gating only — the server still enforces via RLS/RPCs.
 */

import type { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { can, type AdminPermission, type AdminRole } from '../../lib/roles';

interface RoleGateProps {
    /** Gate by explicit role(s). */
    role?:       AdminRole | AdminRole[];
    /** Gate by capability (preferred — survives role re-tiering). */
    permission?: AdminPermission;
    children:    ReactNode;
    fallback?:   ReactNode;
    mode?:       'hide' | 'disable';
}

export default function RoleGate({ role, permission, children, fallback = null, mode = 'hide' }: RoleGateProps) {
    const { role: actual } = useAuth();

    let ok = false;
    if (permission) {
        ok = can(actual, permission);
    } else if (role) {
        const allowed = Array.isArray(role) ? role : [role];
        ok = !!actual && allowed.includes(actual as AdminRole);
    }

    if (ok) return <>{children}</>;

    if (mode === 'disable') {
        const reqLabel = permission
            ?? (Array.isArray(role) ? role.join(', ') : role)
            ?? 'elevated role';
        return (
            <span className="role-gate-disabled" aria-disabled="true" title={`Requires: ${reqLabel}`}>
                {children}
            </span>
        );
    }
    return <>{fallback}</>;
}

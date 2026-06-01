/**
 * OrgPageShell — shared scaffold for every org admin page.
 *
 * Responsibilities:
 *   1. Render the standard <Page> header with title/subtitle/icon/actions
 *   2. Guard rendering when no org is active (shows a helpful message
 *      instead of every page reimplementing this branch)
 *   3. Optional permission gate (e.g. {require: 'admin'} hides body if
 *      the active role isn't allowed; RLS still enforces server-side)
 *
 * Use:
 *   <OrgPageShell title="Members" icon={...} actions={...} require="adminTier">
 *      <Table .../>
 *   </OrgPageShell>
 */

import type { CSSProperties, ReactNode } from 'react';
import Page from '../ui/Page';
import { useScope } from '../../context/ScopeContext';
import { canManageMembers, canManageTeams, isAdminTier, type OrgRole } from '../../lib/org';
import '../../org-glass.css';

type RequireGate = 'orgMember' | 'managerTier' | 'adminTier' | 'owner';

interface Props {
    title: string;
    subtitle?: string;
    icon?: ReactNode;
    actions?: ReactNode;
    crumbs?: Array<{ label: string; to?: string }>;
    require?: RequireGate;     // default: orgMember (just being in the org)
    children: ReactNode;
}

function checkGate(role: OrgRole | null, require: RequireGate): boolean {
    if (!role) return false;
    switch (require) {
        case 'orgMember':   return true;
        case 'managerTier': return canManageTeams(role);
        case 'adminTier':   return isAdminTier(role) || canManageMembers(role);
        case 'owner':       return role === 'owner';
        default:            return true;
    }
}

export default function OrgPageShell({
    title, subtitle, icon, actions, crumbs, require = 'orgMember', children,
}: Props) {
    const { scope } = useScope();

    if (!scope.orgId || scope.type !== 'org') {
        return (
            <Page title={title} subtitle="Switch to a workspace to manage it." icon={icon} crumbs={crumbs}>
                <div className="muted" style={{ padding: '32px 0', textAlign: 'center' }}>
                    No active organisation selected. Use the workspace switcher in the top right.
                </div>
            </Page>
        );
    }

    const allowed = checkGate(scope.role, require);
    if (!allowed) {
        return (
            <Page title={title} subtitle={subtitle} icon={icon} crumbs={crumbs}>
                <div className="muted" style={{ padding: '32px 0', textAlign: 'center' }}>
                    You don&apos;t have permission to view this page.
                </div>
            </Page>
        );
    }

    const brand = (scope.membership as any)?.brand_color || undefined;
    const brandStyle = (brand ? { ['--org-brand' as any]: brand } : undefined) as CSSProperties | undefined;

    return (
        <Page title={title} subtitle={subtitle} icon={icon} actions={actions} crumbs={crumbs}>
            <div className="org-glass-root" style={brandStyle}>
                {children}
            </div>
        </Page>
    );
}

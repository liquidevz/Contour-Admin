/**
 * Reusable status / role badges for the org module.
 * Single source of truth for org-related visual taxonomy.
 */

import { Crown, Shield, BadgeCheck, UserCircle } from 'lucide-react';
import type { OrgRole, OrgMemberStatus, OrgStatus } from '../../lib/org';

const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
};

const roleStyles: Record<OrgRole, { bg: string; color: string }> = {
    owner:   { bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
    admin:   { bg: 'rgba(99,102,241,0.12)', color: '#a5a8ff' },
    manager: { bg: 'rgba(99,102,241,0.10)', color: '#9aa3ff' },
    member:  { bg: 'rgba(138,138,150,0.15)', color: '#b0b0bc' },
    guest:   { bg: 'rgba(138,138,150,0.10)', color: '#9a9aa6' },
};

export function RoleBadge({ role }: { role: OrgRole }) {
    const s = roleStyles[role] ?? roleStyles.member;
    const icon =
        role === 'owner'   ? <Crown size={11} /> :
        role === 'admin'   ? <Shield size={11} /> :
        role === 'manager' ? <BadgeCheck size={11} /> :
        <UserCircle size={11} />;
    return <span style={{ ...baseStyle, background: s.bg, color: s.color }}>{icon}{role}</span>;
}

const memberStatusColors: Record<OrgMemberStatus, string> = {
    active:    '#22c55e',
    invited:   '#eab308',
    suspended: '#f97316',
    left:      '#8a8a96',
};

export function MemberStatusBadge({ status }: { status: OrgMemberStatus }) {
    const c = memberStatusColors[status] ?? '#8a8a96';
    return (
        <span style={{ ...baseStyle, background: c + '22', color: c }}>
            {status}
        </span>
    );
}

const orgStatusColors: Record<OrgStatus, string> = {
    active:        '#22c55e',
    pending_claim: '#eab308',
    suspended:     '#f97316',
    deleted:       '#8a8a96',
};

export function OrgStatusBadge({ status }: { status: OrgStatus }) {
    const c = orgStatusColors[status] ?? '#8a8a96';
    return (
        <span style={{ ...baseStyle, background: c + '22', color: c }}>
            {status.replace('_', ' ')}
        </span>
    );
}

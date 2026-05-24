/**
 * Page — standard shell for every admin page.
 *
 * Provides:
 *  - Title + plain-English subtitle
 *  - Optional hero metrics row
 *  - Optional right-side action buttons
 *  - Optional breadcrumb trail
 *  - Auto-applies role gating to children if `requireRole` is set
 *
 * Use this on every page so the layout stays consistent.
 */

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export interface Breadcrumb {
    label: string;
    to?:   string;
}

interface PageProps {
    title:        string;
    subtitle?:    string;          // Plain-English explanation — what this page does, written for a non-technical reader.
    icon?:        ReactNode;       // Optional inline icon next to the title.
    actions?:     ReactNode;       // Right-side controls (buttons, filters, search).
    crumbs?:      Breadcrumb[];    // Optional breadcrumb trail.
    hero?:        ReactNode;       // Optional MetricCard row or other hero content.
    children:     ReactNode;       // Main page body.
    requireRole?: ('superadmin' | 'admin' | 'analyst')[];   // If set, render a `<RoleDenied>` panel when user's role isn't included.
}

export default function Page({
    title, subtitle, icon, actions, crumbs, hero, children, requireRole,
}: PageProps) {
    const { role } = useAuth();
    const allowed  = !requireRole || (role && requireRole.includes(role as any));

    return (
        <div className="page">
            {crumbs && crumbs.length > 0 && (
                <nav className="page-crumbs" aria-label="Breadcrumb">
                    {crumbs.map((c, i) => (
                        <span key={i} className="page-crumb-item">
                            {c.to
                                ? <Link to={c.to}>{c.label}</Link>
                                : <span className="muted">{c.label}</span>}
                            {i < crumbs.length - 1 && <ChevronRight size={12} className="page-crumb-sep" />}
                        </span>
                    ))}
                </nav>
            )}

            <header className="page-header">
                <div className="page-header-row">
                    <div className="page-title-block">
                        <h1 className="page-title">
                            {icon && <span className="page-title-icon">{icon}</span>}
                            {title}
                        </h1>
                        {subtitle && <p className="page-subtitle">{subtitle}</p>}
                    </div>
                    {actions && <div className="page-actions">{actions}</div>}
                </div>
            </header>

            {hero && <div className="page-hero">{hero}</div>}

            <div className="page-body">
                {allowed
                    ? children
                    : <RoleDenied required={requireRole!} actual={role} />}
            </div>
        </div>
    );
}


function RoleDenied({ required, actual }: { required: string[]; actual: string | null }) {
    return (
        <div className="role-denied">
            <div className="role-denied-icon" aria-hidden>🔒</div>
            <h3>You don't have access to this page</h3>
            <p>
                This page requires one of these roles: <strong>{required.join(', ')}</strong>.
                {' '}You're signed in as <strong>{actual || 'no role'}</strong>.
            </p>
            <p className="muted">Ask a superadmin to grant you access via <Link to="/settings">Settings → Admins</Link>.</p>
        </div>
    );
}

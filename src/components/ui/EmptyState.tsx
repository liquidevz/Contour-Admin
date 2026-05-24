/**
 * EmptyState — narrative empty / zero-data placeholder.
 *
 * Instead of "No data", explain what the page is for and what the
 * admin can do next. Non-technical readers respond much better to
 * "You haven't added any tags yet — start with marketplace categories"
 * than to a blank table.
 */

import type { ComponentType, ReactNode } from 'react';

interface EmptyStateProps {
    icon?:     ComponentType<{ size?: number }>;
    title:     string;
    body?:     string | ReactNode;
    action?:   ReactNode;
    tone?:     'neutral' | 'info' | 'warning';
    size?:     'sm' | 'md' | 'lg';
}

export default function EmptyState({
    icon: Icon, title, body, action, tone = 'neutral', size = 'md',
}: EmptyStateProps) {
    return (
        <div className={`empty-state empty-${tone} empty-${size}`}>
            {Icon && (
                <div className="empty-state-icon" aria-hidden>
                    <Icon size={size === 'lg' ? 28 : size === 'sm' ? 18 : 22} />
                </div>
            )}
            <h3 className="empty-state-title">{title}</h3>
            {body && <p className="empty-state-body">{body}</p>}
            {action && <div className="empty-state-action">{action}</div>}
        </div>
    );
}

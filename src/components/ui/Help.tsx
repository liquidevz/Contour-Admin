/**
 * Help — inline (?) icon that reveals a plain-English explanation on hover.
 *
 * For non-technical admins: every technical term (TF-IDF, IDF, δ_u, …)
 * should be wrapped in `<Help text="…">…</Help>` or placed adjacent
 * to one via `<Help text="…" />` (icon-only form).
 *
 * Uses CSS `:hover`/`:focus-within` — no JS state, works on touch via tap.
 */

import { HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';

interface HelpProps {
    text:      string | ReactNode;
    children?: ReactNode;           // If set, wraps the children; tooltip shows on hover.
    size?:     number;              // Icon size, default 13.
    side?:     'top' | 'bottom' | 'right' | 'left';
}

export default function Help({ text, children, size = 13, side = 'top' }: HelpProps) {
    const tooltip = (
        <span className={`help-tooltip help-tooltip-${side}`} role="tooltip">
            {text}
        </span>
    );

    if (children) {
        return (
            <span className="help-wrap" tabIndex={0}>
                {children}
                {tooltip}
            </span>
        );
    }

    return (
        <span className="help-icon-wrap" tabIndex={0} aria-label="Help">
            <HelpCircle size={size} className="help-icon" />
            {tooltip}
        </span>
    );
}

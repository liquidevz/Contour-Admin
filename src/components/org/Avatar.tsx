/**
 * Avatar — initials fallback, optional image, multiple sizes.
 * Shared across every org admin page.
 */

import type { CSSProperties } from 'react';

interface Props {
    name?: string | null;
    email?: string | null;
    url?: string | null;
    size?: number;       // px, default 32
    rounded?: boolean;   // default true (circle)
    color?: string;      // background colour for initials variant
}

export default function Avatar({
    name, email, url, size = 32, rounded = true, color,
}: Props) {
    const label = (name ?? email ?? '?').trim();
    const initial = label.charAt(0).toUpperCase() || '?';
    const bg = color ?? 'var(--accent, #6366f1)';

    const style: CSSProperties = {
        width: size, height: size,
        borderRadius: rounded ? '999px' : '6px',
        background: bg,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: Math.max(10, Math.round(size * 0.42)),
        overflow: 'hidden',
        flexShrink: 0,
    };

    if (url) {
        return (
            <span style={style}>
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </span>
        );
    }
    return <span style={style} aria-hidden>{initial}</span>;
}

/**
 * Skeletons — shimmer placeholders for loading states.
 *
 * Three primary shapes:
 *   <TableSkeleton rows={5} cols={4} />   — table-like rows
 *   <ListSkeleton rows={6} />              — vertical card list
 *   <CardSkeleton lines={3} />             — generic block
 *   <CircleSkeleton size={40} />           — avatar
 *   <LineSkeleton width="60%" />           — text line
 *
 * The shimmer animation lives in admin.css — `.skeleton` class.
 * Each block is `aria-hidden` since screen readers should ignore it;
 * the parent loading region should expose its own status.
 */

import type { CSSProperties } from 'react';

interface LineProps {
    width?:  string | number;
    height?: string | number;
    style?:  CSSProperties;
}
export function LineSkeleton({ width = '100%', height = 12, style }: LineProps) {
    return (
        <span
            aria-hidden
            className="skeleton skeleton-line"
            style={{
                display: 'inline-block',
                width,
                height,
                borderRadius: 4,
                ...style,
            }}
        />
    );
}

export function CircleSkeleton({ size = 32 }: { size?: number }) {
    return (
        <span
            aria-hidden
            className="skeleton"
            style={{
                display: 'inline-block',
                width: size,
                height: size,
                borderRadius: '50%',
            }}
        />
    );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
    return (
        <div className="skeleton-card" aria-hidden style={{ padding: 16, borderRadius: 8 }}>
            <LineSkeleton width="40%" height={14} />
            <div style={{ height: 12 }} />
            {Array.from({ length: lines }).map((_, i) => (
                <div key={i} style={{ marginTop: 8 }}>
                    <LineSkeleton width={i === lines - 1 ? '50%' : '90%'} />
                </div>
            ))}
        </div>
    );
}

export function TableSkeleton({
    rows = 6, cols = 4, showHeader = true,
}: { rows?: number; cols?: number; showHeader?: boolean }) {
    const cells = Array.from({ length: cols });
    return (
        <div className="skeleton-table" aria-hidden>
            {showHeader && (
                <div className="skeleton-row skeleton-row-header" style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle, #2a2a35)' }}>
                    {cells.map((_, i) => (
                        <div key={i} style={{ flex: 1 }}>
                            <LineSkeleton width="70%" height={10} />
                        </div>
                    ))}
                </div>
            )}
            {Array.from({ length: rows }).map((_, ri) => (
                <div key={ri} className="skeleton-row" style={{
                    display: 'flex', gap: 12, padding: '14px 16px',
                    borderBottom: '1px solid var(--border-subtle, #2a2a35)',
                }}>
                    {cells.map((_, ci) => (
                        <div key={ci} style={{ flex: 1 }}>
                            <LineSkeleton width={ci === 0 ? '60%' : ci === cols - 1 ? '40%' : '85%'} />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="skeleton-list" aria-hidden>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-subtle, #2a2a35)',
                }}>
                    <CircleSkeleton size={36} />
                    <div style={{ flex: 1 }}>
                        <LineSkeleton width="40%" height={12} />
                        <div style={{ marginTop: 6 }}>
                            <LineSkeleton width="70%" height={10} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function MetricsRowSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 12 }}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="skeleton-card" style={{
                    padding: 16, borderRadius: 8,
                    background: 'var(--bg-elevated, #1a1a23)',
                }}>
                    <LineSkeleton width="50%" height={10} />
                    <div style={{ height: 12 }} />
                    <LineSkeleton width="35%" height={24} />
                </div>
            ))}
        </div>
    );
}

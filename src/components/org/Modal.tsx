/**
 * Modal — minimal reusable dialog. Overlay + click-outside-to-close
 * + ESC handling. Designed for the org module forms (create org,
 * confirm actions, etc.).
 */

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    width?: number;          // px, default 520
    disableBackdropClose?: boolean;
}

export default function Modal({
    open, onClose, title, children, footer, width = 520, disableBackdropClose,
}: Props) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={() => { if (!disableBackdropClose) onClose(); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: width,
                    background: 'var(--bg-elevated, #14141c)',
                    border: '1px solid var(--border-subtle, #2a2a35)',
                    borderRadius: 12, overflow: 'hidden',
                }}
            >
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-subtle, #2a2a35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
                    <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
                        <X size={16} />
                    </button>
                </div>
                <div style={{ padding: 20, display: 'grid', gap: 12 }}>
                    {children}
                </div>
                {footer && (
                    <div style={{
                        padding: '12px 20px',
                        borderTop: '1px solid var(--border-subtle, #2a2a35)',
                        display: 'flex', justifyContent: 'flex-end', gap: 8,
                    }}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * FormField — paired label + content + hint helper used across the
 * org module's forms. Lives here to avoid one-off duplications.
 */
export function FormField({
    label, hint, children, required,
}: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
    return (
        <div>
            <label style={{
                display: 'block', fontSize: 11, letterSpacing: 1,
                textTransform: 'uppercase', color: 'var(--text-muted, #8a8a96)',
                marginBottom: 4,
            }}>
                {required && <span style={{ color: '#ef4444', marginRight: 4 }}>*</span>}
                {label}
            </label>
            {children}
            {hint && (
                <div style={{ fontSize: 11, color: 'var(--text-muted, #8a8a96)', marginTop: 4 }}>
                    {hint}
                </div>
            )}
        </div>
    );
}

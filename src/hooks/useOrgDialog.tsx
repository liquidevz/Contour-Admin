/**
 * useOrgDialog — lightweight confirm/alert replacement for admin org pages.
 *
 * Replaces native browser `confirm()`, `alert()`, `prompt()` with a
 * React-state-driven inline modal so the UI never blocks on system dialogs.
 * Used by all org pages (Projects, Approvals, Members, Domains, Teams, etc.)
 */

import { useState, useCallback } from 'react';

interface DialogConfig {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void | Promise<void>;
}

interface DialogState extends DialogConfig {
    open: boolean;
    running: boolean;
}

const INIT: DialogState = {
    open: false, running: false,
    title: '', onConfirm: () => {},
};

export function useOrgDialog() {
    const [dialog, setDialog] = useState<DialogState>(INIT);

    const confirm = useCallback((cfg: DialogConfig) => {
        setDialog({ ...INIT, ...cfg, open: true, running: false });
    }, []);

    const close = useCallback(() => setDialog(INIT), []);

    const run = useCallback(async () => {
        setDialog(d => ({ ...d, running: true }));
        try { await dialog.onConfirm(); } finally { setDialog(INIT); }
    }, [dialog]);

    return { dialog, confirm, close, run };
}

// ─── Inline ConfirmModal component ────────────────────────────────────────────
// Drop-in inside any page — renders nothing when dialog.open=false.

interface ConfirmModalProps {
    dialog: DialogState;
    onClose: () => void;
    onConfirm: () => void;
}

const VARIANT_STYLES = {
    danger:  { header: '#EF4444', btn: '#EF4444' },
    warning: { header: '#F59E0B', btn: '#F59E0B' },
    info:    { header: 'var(--accent,#7c5cfc)', btn: 'var(--accent,#7c5cfc)' },
};

export function OrgConfirmModal({ dialog, onClose, onConfirm }: ConfirmModalProps) {
    if (!dialog.open) return null;
    const variant = VARIANT_STYLES[dialog.variant ?? 'danger'];

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'var(--bg-elevated,#14141c)',
                border: '1px solid var(--border-subtle,#2a2a35)',
                borderRadius: 12, padding: 0,
                width: '100%', maxWidth: 420,
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                overflow: 'hidden',
            }}>
                {/* Coloured top bar */}
                <div style={{ height: 4, background: variant.header }} />

                <div style={{ padding: '20px 24px' }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary,#e8e8f0)' }}>
                        {dialog.title}
                    </h3>
                    {dialog.message && (
                        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary,#b0b0bc)', lineHeight: 1.5 }}>
                            {dialog.message}
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button
                            className="btn btn-ghost"
                            onClick={onClose}
                            disabled={dialog.running}
                        >
                            {dialog.cancelText ?? 'Cancel'}
                        </button>
                        <button
                            className="btn"
                            style={{ background: variant.btn, color: '#fff', border: 'none', opacity: dialog.running ? 0.7 : 1 }}
                            onClick={onConfirm}
                            disabled={dialog.running}
                        >
                            {dialog.running ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="spin" style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block' }} />
                                    Working…
                                </span>
                            ) : (dialog.confirmText ?? 'Confirm')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Toast helper ─────────────────────────────────────────────────────────────
// Lightweight inline success/error message. Mount once per page.

interface ToastState { msg: string; kind: 'success' | 'error'; }

export function useOrgToast() {
    const [toast, setToast] = useState<ToastState | null>(null);

    const show = useCallback((msg: string, kind: 'success' | 'error' = 'success') => {
        setToast({ msg, kind });
        setTimeout(() => setToast(null), 3500);
    }, []);

    return { toast, show };
}

interface ToastBannerProps { toast: ToastState | null; }

export function OrgToastBanner({ toast }: ToastBannerProps) {
    if (!toast) return null;
    return (
        <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10000, pointerEvents: 'none',
            background: toast.kind === 'success' ? '#10B981' : '#EF4444',
            color: '#fff', padding: '10px 20px', borderRadius: 8,
            fontSize: 14, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
        }}>
            {toast.kind === 'success' ? '✓ ' : '✕ '}{toast.msg}
        </div>
    );
}

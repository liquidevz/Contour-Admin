/**
 * Toast — non-blocking status notifications.
 *
 * Anywhere in the app:
 *     import { toast } from '@/components/ui/Toast';
 *     toast.success('Tag promoted to ontology');
 *     toast.error('Save failed', { detail: err.message });
 *
 * The host component must be mounted once at the root (AdminLayout).
 */

import { useEffect, useState } from 'react';
import { Check, AlertTriangle, Info, X, AlertCircle } from 'lucide-react';

type Variant = 'success' | 'error' | 'warning' | 'info';
interface ToastEntry {
    id:        number;
    variant:   Variant;
    title:     string;
    detail?:   string;
    timeoutMs: number;
}

let counter = 0;
const listeners = new Set<(t: ToastEntry[]) => void>();
let entries: ToastEntry[] = [];

function emit() { listeners.forEach(fn => fn(entries.slice())); }

function push(variant: Variant, title: string, opts?: { detail?: string; timeoutMs?: number }) {
    const e: ToastEntry = {
        id:        ++counter,
        variant,
        title,
        detail:    opts?.detail,
        timeoutMs: opts?.timeoutMs ?? (variant === 'error' ? 7000 : 3500),
    };
    entries = [...entries, e];
    emit();
    if (e.timeoutMs > 0) {
        setTimeout(() => dismiss(e.id), e.timeoutMs);
    }
    return e.id;
}

function dismiss(id: number) {
    entries = entries.filter(e => e.id !== id);
    emit();
}

export const toast = {
    success: (title: string, opts?: { detail?: string; timeoutMs?: number }) => push('success', title, opts),
    error:   (title: string, opts?: { detail?: string; timeoutMs?: number }) => push('error',   title, opts),
    warning: (title: string, opts?: { detail?: string; timeoutMs?: number }) => push('warning', title, opts),
    info:    (title: string, opts?: { detail?: string; timeoutMs?: number }) => push('info',    title, opts),
    dismiss,
};

export default function ToastHost() {
    const [list, setList] = useState<ToastEntry[]>(entries);
    useEffect(() => {
        listeners.add(setList);
        return () => { listeners.delete(setList); };
    }, []);

    return (
        <div className="toast-host" role="region" aria-label="Notifications">
            {list.map(t => (
                <div key={t.id} className={`toast toast-${t.variant}`}>
                    <ToastIcon variant={t.variant} />
                    <div className="toast-body">
                        <div className="toast-title">{t.title}</div>
                        {t.detail && <div className="toast-detail">{t.detail}</div>}
                    </div>
                    <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}

function ToastIcon({ variant }: { variant: Variant }) {
    switch (variant) {
        case 'success': return <Check size={16} />;
        case 'error':   return <AlertCircle size={16} />;
        case 'warning': return <AlertTriangle size={16} />;
        case 'info':    return <Info size={16} />;
    }
}

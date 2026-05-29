/**
 * ConfirmModal — safe confirmation for destructive actions.
 *
 * Three variants of safety:
 *   1. `severity: 'low'`      — single click button.
 *   2. `severity: 'medium'`   — two-step (review then confirm).
 *   3. `severity: 'high'`     — typed confirmation (e.g. type the user's email).
 *
 * Always renders the impact summary so the admin knows what's about to
 * happen. Optional "consequences" bullet list spells out blast radius.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
    open:                boolean;
    onClose:             () => void;
    onConfirm:           () => void | Promise<void>;
    title:               string;
    body?:               string | ReactNode;
    consequences?:       string[];
    severity?:           'low' | 'medium' | 'high';
    confirmLabel?:       string;
    cancelLabel?:        string;
    /** For severity=high: the exact string the user must type to enable confirm. */
    typedConfirm?:       string;
    /** Custom prompt shown above the typed-confirm input. */
    typedConfirmPrompt?: string | ReactNode;
    busy?:               boolean;
}

export default function ConfirmModal({
    open, onClose, onConfirm, title, body, consequences,
    severity = 'medium', confirmLabel, cancelLabel = 'Cancel',
    typedConfirm, typedConfirmPrompt, busy,
}: ConfirmModalProps) {
    const [typed, setTyped]   = useState('');
    const [acknowledged, ack] = useState(false);
    const inputRef            = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setTyped('');
            ack(false);
            // Focus the input or the cancel button after open
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    if (!open) return null;

    const needsTyped = severity === 'high' && !!typedConfirm;
    const needsAck   = severity === 'medium';
    const canConfirm = !busy
        && (!needsTyped || typed === typedConfirm)
        && (!needsAck   || acknowledged);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className={`modal modal-confirm modal-severity-${severity}`} onClick={e => e.stopPropagation()} role="dialog" aria-modal>
                <div className="modal-header">
                    <div className="modal-confirm-title-row">
                        {severity !== 'low' && <AlertTriangle size={20} className={`severity-icon severity-${severity}`} />}
                        <h2>{title}</h2>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body">
                    {body && <div className="modal-confirm-body">{body}</div>}

                    {consequences && consequences.length > 0 && (
                        <div className="modal-confirm-consequences">
                            <div className="consequences-label">This will:</div>
                            <ul>
                                {consequences.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                        </div>
                    )}

                    {needsAck && (
                        <label className="modal-confirm-ack">
                            <input
                                type="checkbox"
                                checked={acknowledged}
                                onChange={e => ack(e.target.checked)}
                            />
                            <span>I understand and want to proceed.</span>
                        </label>
                    )}

                    {needsTyped && (
                        <div className="modal-confirm-typed">
                            <label className="form-label">
                                {typedConfirmPrompt || <>Type <code>{typedConfirm}</code> to confirm</>}
                            </label>
                            <input
                                ref={inputRef}
                                className="input-field"
                                value={typed}
                                onChange={e => setTyped(e.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{cancelLabel}</button>
                    <button
                        className={`btn ${severity === 'high' ? 'btn-danger' : 'btn-primary'}`}
                        onClick={onConfirm}
                        disabled={!canConfirm}
                    >
                        {busy ? 'Working…' : (confirmLabel || (severity === 'high' ? 'Delete' : 'Confirm'))}
                    </button>
                </div>
            </div>
        </div>
    );
}

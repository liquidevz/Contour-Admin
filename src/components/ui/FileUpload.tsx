/**
 * FileUpload — generic single-file upload widget against Supabase Storage.
 *
 * Modes:
 *   variant='logo'     — square preview, 256×256 target, accepts image/*
 *   variant='avatar'   — round preview, 256×256 target, accepts image/*
 *   variant='generic'  — file row, no preview
 *
 * Uploads to the `org-assets` bucket. Path layout enforced by RLS in
 * migration 073:
 *   org-assets/<org_id>/logo/<filename>
 *   org-assets/<org_id>/avatars/<user_id>/<filename>
 *
 * On success calls onUploaded(publicUrl). The caller persists the URL
 * onto whatever row needs it (organizations.logo_url, etc.). The widget
 * itself is stateless beyond preview + progress.
 */

import { useCallback, useRef, useState } from 'react';
import { Upload, X, ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from './Toast';

interface FileUploadProps {
    bucket?:        string;                  // default 'org-assets'
    folder:         string;                  // e.g. `${orgId}/logo` or `${orgId}/avatars/${userId}`
    variant?:       'logo' | 'avatar' | 'generic';
    currentUrl?:    string | null;           // existing image for preview
    maxBytes?:      number;                  // default 5 MB
    accept?:        string;                  // default 'image/*'
    label?:         string;                  // shown above the dropzone
    disabled?:      boolean;
    onUploaded:     (publicUrl: string, path: string) => void | Promise<void>;
    onCleared?:     () => void | Promise<void>;
}

const DEFAULT_MAX = 5 * 1024 * 1024;

export default function FileUpload({
    bucket = 'org-assets',
    folder,
    variant = 'generic',
    currentUrl,
    maxBytes = DEFAULT_MAX,
    accept = 'image/*',
    label,
    disabled,
    onUploaded,
    onCleared,
}: FileUploadProps) {
    const inputRef           = useRef<HTMLInputElement>(null);
    const [busy, setBusy]    = useState(false);
    const [drag, setDrag]    = useState(false);
    const [err, setErr]      = useState<string | null>(null);
    const [preview, setPrev] = useState<string | null>(currentUrl ?? null);

    const cleanName = (raw: string) =>
        raw.toLowerCase().replace(/[^a-z0-9.\-_]/g, '_').replace(/^_+|_+$/g, '');

    const handleFile = useCallback(async (file: File) => {
        setErr(null);
        if (!file) return;
        if (file.size > maxBytes) {
            setErr(`File too large. Max ${(maxBytes / 1024 / 1024).toFixed(1)} MB.`);
            return;
        }
        if (accept !== '*' && !file.type.match(/^image\//) && accept.startsWith('image/')) {
            setErr('Only image files are allowed.');
            return;
        }

        setBusy(true);
        try {
            // Path: <folder>/<timestamp>-<original>.<ext>
            const ts   = Date.now();
            const safe = cleanName(file.name);
            const path = `${folder.replace(/\/+$/, '')}/${ts}-${safe}`;

            const { error: upErr } = await supabase
                .storage
                .from(bucket)
                .upload(path, file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: file.type,
                });
            if (upErr) throw upErr;

            const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
            const publicUrl = pub.publicUrl;

            setPrev(publicUrl);
            await onUploaded(publicUrl, path);
            toast.success('Upload complete');
        } catch (e: any) {
            const msg = e?.message ?? 'Upload failed';
            setErr(msg);
            toast.error('Upload failed', { detail: msg });
        } finally {
            setBusy(false);
        }
    }, [bucket, folder, maxBytes, accept, onUploaded]);

    const onDrop = (ev: React.DragEvent) => {
        ev.preventDefault();
        setDrag(false);
        if (disabled || busy) return;
        const f = ev.dataTransfer.files?.[0];
        if (f) void handleFile(f);
    };

    const handleClear = async () => {
        setPrev(null);
        if (onCleared) await onCleared();
    };

    const baseClass = `file-upload file-upload-${variant}${drag ? ' is-drag' : ''}${disabled ? ' is-disabled' : ''}`;

    return (
        <div className={baseClass}>
            {label && <label className="file-upload-label">{label}</label>}

            <div
                className="file-upload-dropzone"
                onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => { if (!disabled && !busy) inputRef.current?.click(); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click(); }}
                aria-disabled={disabled}
                style={variant !== 'generic' ? { width: 120, height: 120, borderRadius: variant === 'avatar' ? '50%' : 8 } : undefined}
            >
                {preview && variant !== 'generic' ? (
                    <img
                        src={preview}
                        alt="preview"
                        style={{
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                            borderRadius: variant === 'avatar' ? '50%' : 8,
                        }}
                    />
                ) : (
                    <div className="file-upload-placeholder" style={{ textAlign: 'center', padding: 16 }}>
                        {variant === 'generic' ? <Upload size={20} /> : <ImageIcon size={28} />}
                        <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-secondary)' }}>
                            {busy ? 'Uploading…' : drag ? 'Drop to upload' : 'Click or drop'}
                        </div>
                    </div>
                )}

                {busy && (
                    <div className="file-upload-overlay" style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.4)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        borderRadius: 'inherit',
                    }}>
                        <Loader2 size={20} className="spin" color="#fff" />
                    </div>
                )}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={accept}
                disabled={disabled || busy}
                style={{ display: 'none' }}
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = ''; // allow re-upload of same file
                }}
            />

            {preview && variant !== 'generic' && !busy && (
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleClear}
                    style={{ marginTop: 8 }}
                >
                    <X size={14} /> Clear
                </button>
            )}

            {err && (
                <div className="file-upload-error" style={{
                    marginTop: 8, fontSize: 12, color: '#ef4444',
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <AlertTriangle size={12} /> {err}
                </div>
            )}
        </div>
    );
}

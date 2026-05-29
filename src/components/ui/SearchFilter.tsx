/**
 * SearchFilter — debounced search box + chip filters + optional date range.
 *
 * Usage:
 *   <SearchFilter
 *     query={q} onQueryChange={setQ}
 *     chips={[
 *       { key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, ...], value: status, onChange: setStatus },
 *     ]}
 *     dateRange={{ from, until, onChange: (f,u) => { ... } }}
 *   />
 *
 * Stateless wrapper — parent owns the values and is responsible for
 * actually re-running the query. The debounce only delays the
 * onQueryChange callback by 250ms.
 */

import { useEffect, useRef, useState } from 'react';
import { Search, X, Filter, Calendar } from 'lucide-react';

interface ChipOption {
    value: string;
    label: string;
    count?: number;
}
export interface ChipFilter {
    key:      string;
    label:    string;
    value:    string | null;
    options:  ChipOption[];
    onChange: (v: string | null) => void;
}

interface SearchFilterProps {
    query:           string;
    onQueryChange:   (q: string) => void;
    placeholder?:    string;
    chips?:          ChipFilter[];
    dateRange?: {
        from:     string | null;
        until:    string | null;
        onChange: (from: string | null, until: string | null) => void;
    };
    rightExtra?:     React.ReactNode;
}

export default function SearchFilter({
    query, onQueryChange,
    placeholder = 'Search…',
    chips, dateRange, rightExtra,
}: SearchFilterProps) {
    const [local, setLocal] = useState(query);
    const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounce typing into parent.
    useEffect(() => {
        if (tRef.current) clearTimeout(tRef.current);
        tRef.current = setTimeout(() => {
            if (local !== query) onQueryChange(local);
        }, 250);
        return () => { if (tRef.current) clearTimeout(tRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [local]);

    // If parent resets externally, sync down.
    useEffect(() => { if (query !== local) setLocal(query); /* eslint-disable-next-line */ }, [query]);

    return (
        <div className="search-filter" style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
            padding: 12, background: 'var(--bg-elevated, #1a1a23)',
            borderRadius: 8, marginBottom: 12,
        }}>
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
                <Search size={14} style={{
                    position: 'absolute', left: 10, top: '50%',
                    transform: 'translateY(-50%)', color: 'var(--text-muted)',
                }} />
                <input
                    className="input-field"
                    style={{ paddingLeft: 30, paddingRight: 30, width: '100%' }}
                    placeholder={placeholder}
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                />
                {local && (
                    <button
                        className="btn btn-ghost btn-icon"
                        style={{
                            position: 'absolute', right: 4, top: '50%',
                            transform: 'translateY(-50%)', padding: 4,
                        }}
                        aria-label="Clear search"
                        onClick={() => setLocal('')}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {chips && chips.length > 0 && chips.map((c) => (
                <ChipDropdown key={c.key} chip={c} />
            ))}

            {dateRange && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="date"
                        className="input-field input-field-sm"
                        value={dateRange.from ?? ''}
                        onChange={(e) => dateRange.onChange(e.target.value || null, dateRange.until)}
                        style={{ width: 140 }}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <input
                        type="date"
                        className="input-field input-field-sm"
                        value={dateRange.until ?? ''}
                        onChange={(e) => dateRange.onChange(dateRange.from, e.target.value || null)}
                        style={{ width: 140 }}
                    />
                    {(dateRange.from || dateRange.until) && (
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => dateRange.onChange(null, null)}
                            aria-label="Clear dates"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            )}

            {rightExtra && <div style={{ marginLeft: 'auto' }}>{rightExtra}</div>}
        </div>
    );
}

function ChipDropdown({ chip }: { chip: ChipFilter }) {
    const [open, setOpen] = useState(false);
    const selected = chip.options.find((o) => o.value === chip.value);

    return (
        <div style={{ position: 'relative' }}>
            <button
                className={`btn btn-ghost btn-sm${chip.value ? ' is-active' : ''}`}
                onClick={() => setOpen((v) => !v)}
                style={{
                    border: '1px solid var(--border-subtle, #2a2a35)',
                    background: chip.value ? 'rgba(99,102,241,0.12)' : undefined,
                }}
            >
                <Filter size={12} />
                <span style={{ marginLeft: 4 }}>
                    {chip.label}
                    {selected && <span style={{ marginLeft: 6, color: 'var(--text-primary)' }}>: {selected.label}</span>}
                </span>
                {chip.value && (
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); chip.onChange(null); }}
                        style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                        aria-label="Clear filter"
                    >
                        <X size={12} />
                    </span>
                )}
            </button>

            {open && (
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 50 }}
                        onClick={() => setOpen(false)}
                    />
                    <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                        background: 'var(--bg-card, #1a1a23)',
                        border: '1px solid var(--border-subtle, #2a2a35)',
                        borderRadius: 6, padding: 4, minWidth: 180, zIndex: 51,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    }}>
                        {chip.options.map((opt) => (
                            <button
                                key={opt.value}
                                className={`btn btn-ghost btn-sm${chip.value === opt.value ? ' is-active' : ''}`}
                                style={{
                                    width: '100%', justifyContent: 'flex-start',
                                    background: chip.value === opt.value ? 'rgba(99,102,241,0.12)' : undefined,
                                }}
                                onClick={() => { chip.onChange(opt.value); setOpen(false); }}
                            >
                                <span>{opt.label}</span>
                                {opt.count !== undefined && (
                                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11 }}>
                                        {opt.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

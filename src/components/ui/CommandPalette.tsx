/**
 * CommandPalette — Cmd/Ctrl+K to jump anywhere.
 *
 * Indexes every nav item registered in AdminLayout's navSections plus a few
 * canned actions. Fuzzy substring match, keyboard navigation, Esc to close.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

export interface PaletteItem {
    id:       string;
    label:    string;
    section?: string;
    hint?:    string;
    icon?:    ComponentType<{ size?: number }>;
    action:   () => void;
    keywords?: string[];
}

interface CommandPaletteProps {
    items: PaletteItem[];
}

export default function CommandPalette({ items }: CommandPaletteProps) {
    const [open, setOpen]       = useState(false);
    const [query, setQuery]     = useState('');
    const [selected, setSelected] = useState(0);
    const inputRef              = useRef<HTMLInputElement>(null);
    const listRef               = useRef<HTMLDivElement>(null);

    // Cmd/Ctrl+K opens; / opens when no input focused; Esc closes
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const isMeta = e.metaKey || e.ctrlKey;
            if (isMeta && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen(o => !o);
                return;
            }
            if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                setOpen(true);
                return;
            }
            if (e.key === 'Escape' && open) {
                e.preventDefault();
                setOpen(false);
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 30);
            setQuery('');
            setSelected(0);
        }
    }, [open]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items.slice(0, 50);
        return items
            .map(it => ({
                it,
                score: scoreItem(it, q),
            }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 50)
            .map(x => x.it);
    }, [items, query]);

    useEffect(() => { setSelected(0); }, [query]);

    // Arrow-key navigation
    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelected(s => Math.min(results.length - 1, s + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelected(s => Math.max(0, s - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const r = results[selected];
            if (r) { setOpen(false); r.action(); }
        }
    }

    if (!open) return null;

    return (
        <div className="cmdk-overlay" onClick={() => setOpen(false)} role="dialog" aria-modal>
            <div className="cmdk-panel" onClick={e => e.stopPropagation()}>
                <div className="cmdk-input-row">
                    <Search size={16} className="cmdk-search-icon" />
                    <input
                        ref={inputRef}
                        className="cmdk-input"
                        placeholder="Jump to page or run an action…  (press Esc to close)"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                        spellCheck={false}
                        autoComplete="off"
                    />
                </div>

                <div className="cmdk-results" ref={listRef}>
                    {results.length === 0 ? (
                        <div className="cmdk-empty">No matches for "{query}"</div>
                    ) : groupBySection(results).map(group => (
                        <div className="cmdk-group" key={group.section}>
                            <div className="cmdk-group-label">{group.section}</div>
                            {group.items.map((it) => {
                                const idx = results.indexOf(it);
                                const active = idx === selected;
                                return (
                                    <button
                                        key={it.id}
                                        type="button"
                                        className={`cmdk-result ${active ? 'active' : ''}`}
                                        onMouseEnter={() => setSelected(idx)}
                                        onClick={() => { setOpen(false); it.action(); }}
                                    >
                                        {it.icon && <it.icon size={14} />}
                                        <span className="cmdk-result-label">{it.label}</span>
                                        {it.hint && <span className="cmdk-result-hint">{it.hint}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>

                <div className="cmdk-footer">
                    <kbd>↑</kbd><kbd>↓</kbd> navigate
                    <kbd>↵</kbd> open
                    <kbd>Esc</kbd> close
                </div>
            </div>
        </div>
    );
}


// Reusable helper for building a palette from nav items
export function useNavCommands(nav: { section: string; items: { to: string; label: string; icon: ComponentType<{ size?: number }> }[] }[]): PaletteItem[] {
    const navigate = useNavigate();
    return useMemo(() => {
        return nav.flatMap(s =>
            s.items.map(it => ({
                id:      `nav:${it.to}`,
                label:   it.label,
                section: s.section,
                hint:    it.to,
                icon:    it.icon,
                action:  () => navigate(it.to),
            })),
        );
    }, [nav, navigate]);
}


function groupBySection(items: PaletteItem[]): { section: string; items: PaletteItem[] }[] {
    const map = new Map<string, PaletteItem[]>();
    for (const it of items) {
        const s = it.section ?? 'Other';
        if (!map.has(s)) map.set(s, []);
        map.get(s)!.push(it);
    }
    return Array.from(map.entries()).map(([section, items]) => ({ section, items }));
}


function scoreItem(it: PaletteItem, q: string): number {
    const hay = [it.label, it.section ?? '', it.hint ?? '', ...(it.keywords ?? [])].join(' ').toLowerCase();
    if (it.label.toLowerCase() === q) return 1000;
    if (it.label.toLowerCase().startsWith(q)) return 500;
    if (hay.includes(q)) return 100;
    // Loose subsequence match
    let i = 0;
    for (const ch of q) {
        const next = hay.indexOf(ch, i);
        if (next < 0) return 0;
        i = next + 1;
    }
    return 10;
}


export type ReactNodeOk = ReactNode;

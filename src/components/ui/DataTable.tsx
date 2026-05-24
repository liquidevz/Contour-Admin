/**
 * DataTable — responsive table.
 *
 * On desktop, renders a normal <table>. On narrow screens (<= 760px),
 * each row becomes a stacked card with label/value pairs — non-technical
 * users find this far easier to read than a horizontally-scrolling table.
 *
 * Columns declare:
 *   - `key`         — for React keys
 *   - `header`      — column label
 *   - `cell(row)`   — render fn
 *   - `mobileLabel` — optional override for the stacked-card label
 *   - `align`       — 'left' | 'right' | 'center'
 *   - `truncate`    — clip with ellipsis on narrow desktop columns
 *   - `width`       — explicit width on desktop only
 *
 * The table can be paginated externally; this component is just presentational.
 */

import type { ReactNode } from 'react';

export interface DataTableColumn<Row> {
    key:          string;
    header:       ReactNode;
    cell:         (row: Row, i: number) => ReactNode;
    mobileLabel?: string;
    align?:       'left' | 'right' | 'center';
    truncate?:    boolean;
    width?:       number | string;
}

interface DataTableProps<Row> {
    rows:         Row[];
    columns:      DataTableColumn<Row>[];
    rowKey:       (row: Row, i: number) => string;
    onRowClick?:  (row: Row, i: number) => void;
    rowHighlight?:(row: Row) => boolean;
    empty?:       ReactNode;
    dense?:       boolean;
    className?:   string;
}

export default function DataTable<Row>({
    rows, columns, rowKey, onRowClick, rowHighlight, empty, dense, className,
}: DataTableProps<Row>) {
    if (rows.length === 0 && empty) return <>{empty}</>;

    return (
        <div className={`data-table-shell ${dense ? 'dense' : ''} ${className || ''}`}>
            {/* Desktop table */}
            <div className="data-table-wrap data-table-desktop">
                <table className="data-table">
                    <thead>
                        <tr>
                            {columns.map(c => (
                                <th
                                    key={c.key}
                                    style={{ textAlign: c.align ?? 'left', width: c.width }}
                                >
                                    {c.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr
                                key={rowKey(row, i)}
                                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                                className={
                                    (onRowClick ? 'data-row-clickable ' : '') +
                                    (rowHighlight?.(row) ? 'data-row-highlight' : '')
                                }
                            >
                                {columns.map(c => (
                                    <td
                                        key={c.key}
                                        style={{ textAlign: c.align ?? 'left' }}
                                        className={c.truncate ? 'truncate-cell' : undefined}
                                    >
                                        {c.cell(row, i)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile stacked-card view */}
            <div className="data-table-mobile">
                {rows.map((row, i) => (
                    <div
                        key={rowKey(row, i)}
                        className={`data-row-card ${onRowClick ? 'data-row-card-clickable' : ''} ${rowHighlight?.(row) ? 'data-row-highlight' : ''}`}
                        onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                    >
                        {columns.map(c => (
                            <div key={c.key} className="data-row-card-line">
                                <span className="data-row-card-label">{c.mobileLabel ?? labelFromHeader(c.header)}</span>
                                <span className="data-row-card-value">{c.cell(row, i)}</span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}


function labelFromHeader(header: ReactNode): string {
    if (typeof header === 'string') return header;
    if (typeof header === 'number') return String(header);
    return '';
}

/**
 * MetricCard — single KPI tile.
 *
 * Designed for the hero row of any page. Renders large value, label,
 * optional trend (delta vs prior period), optional click-through link,
 * and an icon. Loading skeleton lives here so callers don't have to
 * implement it.
 */

import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import Help from './Help';

interface IconProps { size?: number }
type Trend = { value: number; label?: string; positiveIsGood?: boolean };

interface MetricCardProps {
    label:     string;
    value:     number | string | null | undefined;
    icon?:     ComponentType<IconProps>;
    tone?:     'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'pending';
    to?:       string;                       // Make the card click-through.
    onClick?:  () => void;
    trend?:    Trend;                        // e.g. { value: +12.4, label: 'vs last 7d' }
    help?:     string;                       // Plain-English explanation for non-technical readers.
    suffix?:   ReactNode;                    // e.g. '%' or 'ms'
    loading?:  boolean;
    compact?:  boolean;
}

export default function MetricCard({
    label, value, icon: Icon, tone = 'neutral',
    to, onClick, trend, help, suffix, loading, compact,
}: MetricCardProps) {
    const display = loading
        ? <span className="metric-skeleton" aria-hidden />
        : (value == null ? '—' : value);

    const inner = (
        <div className={`metric-card metric-tone-${tone} ${compact ? 'metric-compact' : ''} ${to || onClick ? 'metric-clickable' : ''}`}>
            <div className="metric-card-row">
                <span className="metric-card-label">
                    {label}
                    {help && <Help text={help} />}
                </span>
                {Icon && <div className="metric-card-icon"><Icon size={16} /></div>}
            </div>
            <div className="metric-card-value">
                {display}
                {suffix != null && !loading && <span className="metric-card-suffix">{suffix}</span>}
            </div>
            {trend && !loading && <TrendBadge trend={trend} />}
        </div>
    );

    if (to)      return <Link to={to} className="metric-link">{inner}</Link>;
    if (onClick) return <button type="button" onClick={onClick} className="metric-link metric-link-button">{inner}</button>;
    return inner;
}


function TrendBadge({ trend }: { trend: Trend }) {
    const { value, label, positiveIsGood = true } = trend;
    const isUp   = value > 0;
    const isFlat = value === 0;
    const good   = isFlat ? null : (isUp === positiveIsGood);

    const Icon = isFlat ? Minus : (isUp ? TrendingUp : TrendingDown);
    const className =
        good === null ? 'trend-flat' :
        good          ? 'trend-good' :
                        'trend-bad';

    const formatted = isFlat ? '0' : (isUp ? '+' : '') + value.toFixed(1) + '%';

    return (
        <div className={`metric-trend ${className}`}>
            <Icon size={11} />
            <span>{formatted}</span>
            {label && <span className="metric-trend-label">{label}</span>}
        </div>
    );
}

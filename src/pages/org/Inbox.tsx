/**
 * Org → Inbox
 *
 * Per-user notifications scoped to the active org. Mark-read,
 * mark-all-read, click-through navigation.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    notifList, notifMarkRead, notifMarkAllRead, type NotifRow,
} from '../../lib/notifications';
import { OrgPageShell, Avatar } from '../../components/org';

export default function OrgInboxPage() {
    const navigate = useNavigate();
    const { scope } = useScope();
    const orgId = scope.orgId;

    const [rows, setRows] = useState<NotifRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [onlyUnread, setOnlyUnread] = useState(true);
    const [bulkBusy, setBulkBusy] = useState(false);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try { setRows(await notifList({ orgId, onlyUnread, limit: 100 })); }
        finally { setLoading(false); }
    }, [orgId, onlyUnread]);

    useEffect(() => { void load(); }, [load]);

    const handleClick = async (n: NotifRow) => {
        if (!n.read_at) {
            try { await notifMarkRead(n.id); } catch { /* ok */ }
        }
        if (n.link) navigate(n.link);
        else void load();
    };

    const handleMarkAllRead = async () => {
        if (!orgId) return;
        setBulkBusy(true);
        try { await notifMarkAllRead(orgId); await load(); }
        finally { setBulkBusy(false); }
    };

    return (
        <OrgPageShell
            title="Inbox"
            subtitle="Everything that needs your attention in this workspace."
            icon={<Bell size={20} />}
            actions={
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" onClick={() => load()}>
                        <RefreshCw size={14} /> <span style={{ marginLeft: 6 }}>Refresh</span>
                    </button>
                    <button className="btn btn-ghost" onClick={() => setOnlyUnread((v) => !v)}>
                        {onlyUnread ? 'Showing unread' : 'Showing all'}
                    </button>
                    <button className="btn btn-primary" onClick={handleMarkAllRead} disabled={bulkBusy || rows.length === 0}>
                        {bulkBusy ? <Loader2 size={14} className="spin" /> : <CheckCheck size={14} />}
                        <span style={{ marginLeft: 6 }}>Mark all read</span>
                    </button>
                </div>
            }
        >
            {loading ? (
                <div style={{ padding: 24, color: 'var(--text-muted,#8a8a96)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Loader2 size={14} className="spin" /> Loading…
                </div>
            ) : rows.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted,#8a8a96)' }}>
                    {onlyUnread ? 'No unread notifications.' : 'No notifications yet.'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rows.map((n) => (
                        <button key={n.id} type="button" onClick={() => handleClick(n)} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12,
                            padding: '12px 16px', textAlign: 'left',
                            background: n.read_at ? 'transparent' : 'var(--bg-elevated,#14141c)',
                            border: '1px solid var(--border-subtle,#2a2a35)',
                            borderRadius: 8, cursor: 'pointer',
                            position: 'relative',
                        }}>
                            {!n.read_at && (
                                <span style={{
                                    position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
                                    width: 6, height: 6, borderRadius: 999, background: 'var(--accent,#6366f1)',
                                }} />
                            )}
                            <Avatar name={n.actor_name} url={n.actor_avatar} size={32} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</div>
                                {n.body && (
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary,#b0b0bc)', marginTop: 2 }}>
                                        {n.body}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--text-muted,#8a8a96)' }}>
                                    <span style={{ fontFamily: 'monospace' }}>{n.kind}</span>
                                    <span>·</span>
                                    <span>{new Date(n.created_at).toLocaleString()}</span>
                                </div>
                            </div>
                            {!n.read_at && (
                                <span style={{ alignSelf: 'center', color: 'var(--text-muted,#8a8a96)' }}>
                                    <Check size={14} />
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </OrgPageShell>
    );
}

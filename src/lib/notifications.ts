/**
 * Org notifications — Supabase RPC wrappers.
 * Mirrors migration 066.
 */

import { supabase } from './supabase';

export interface NotifRow {
    id: string;
    org_id: string;
    kind: string;
    title: string;
    body: string | null;
    link: string | null;
    resource_type: string | null;
    resource_id: string | null;
    payload: any;
    actor_user_id: string | null;
    actor_name: string | null;
    actor_avatar: string | null;
    read_at: string | null;
    created_at: string;
}

export async function notifList(input: {
    orgId?: string | null;
    onlyUnread?: boolean;
    limit?: number;
    offset?: number;
} = {}): Promise<NotifRow[]> {
    const { data, error } = await supabase.rpc('notif_list', {
        p_org_id: input.orgId ?? null,
        p_only_unread: input.onlyUnread ?? false,
        p_limit: input.limit ?? 50,
        p_offset: input.offset ?? 0,
    });
    if (error) throw error;
    return (data ?? []) as NotifRow[];
}

export async function notifUnreadCount(orgId?: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('notif_unread_count', { p_org_id: orgId ?? null });
    if (error) throw error;
    return (data as number) ?? 0;
}

export async function notifMarkRead(id: string): Promise<void> {
    const { error } = await supabase.rpc('notif_mark_read', { p_notif_id: id });
    if (error) throw error;
}

export async function notifMarkAllRead(orgId?: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('notif_mark_all_read', { p_org_id: orgId ?? null });
    if (error) throw error;
    return (data as number) ?? 0;
}

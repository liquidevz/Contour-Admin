/**
 * Workspace admin lib — announcements, the documents drive (pages + files),
 * storage quotas, polymorphic links, and cross-assign. Backed by migrations
 * 088/089 (announcements/docs) and 097 (drive/storage/links/convert).
 *
 * The admin panel is web, so file uploads use a browser File straight into the
 * `org-documents` bucket; quotas are enforced server-side by document_file_create.
 */

import { supabase } from './supabase';

const BUCKET = 'org-documents';

/* ───────────── announcements ───────────── */

export type AnnouncementCategory = 'general' | 'policy' | 'event' | 'alert' | 'milestone';

export interface AnnouncementRow {
    id: string; title: string; body: string; category: AnnouncementCategory;
    pinned: boolean; expires_at: string | null; cover_url: string | null;
    author_id: string | null; author_name: string | null; created_at: string;
}

export async function announcementList(orgId: string, opts: { limit?: number } = {}): Promise<AnnouncementRow[]> {
    const { data, error } = await supabase.rpc('announcement_list', { p_org_id: orgId, p_limit: opts.limit ?? 50, p_offset: 0 });
    if (error) throw error;
    return (data ?? []) as AnnouncementRow[];
}

export async function announcementCreate(input: {
    orgId: string; title: string; body: string; category?: AnnouncementCategory; pinned?: boolean; expiresAt?: string | null;
}): Promise<string> {
    const { data, error } = await supabase.rpc('announcement_create', {
        p_org_id: input.orgId, p_title: input.title, p_body: input.body,
        p_category: input.category ?? 'general', p_pinned: input.pinned ?? false,
        p_expires_at: input.expiresAt ?? null, p_cover_url: null,
    });
    if (error) throw error;
    return data as string;
}

export async function announcementDelete(id: string): Promise<void> {
    const { error } = await supabase.rpc('announcement_delete', { p_id: id });
    if (error) throw error;
}

/* ───────────── drive (pages + files) ───────────── */

export type DocKind = 'page' | 'file';

export interface DriveItem {
    id: string; org_id: string; title: string; slug: string; folder: string | null;
    tags: string[]; visibility: 'org' | 'admin' | 'private'; is_pinned: boolean;
    archived_at: string | null; kind: DocKind; file_path: string | null;
    mime_type: string | null; size_bytes: number; author_id: string | null;
    last_edited_at: string; view_count: number; created_at: string;
}

export interface StorageUsage {
    used_bytes: number; total_bytes_limit: number; per_file_bytes_limit: number;
    file_count: number; archived_file_count: number; page_count: number;
}

export async function driveList(orgId: string, includeArchived = false): Promise<DriveItem[]> {
    let q = supabase.from('org_documents').select('*').eq('org_id', orgId);
    if (!includeArchived) q = q.is('archived_at', null);
    const { data, error } = await q.order('is_pinned', { ascending: false }).order('last_edited_at', { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []) as DriveItem[];
}

export async function storageUsage(orgId: string): Promise<StorageUsage> {
    const { data, error } = await supabase.rpc('org_storage_usage', { p_org: orgId });
    if (error) throw error;
    return data as StorageUsage;
}

/** Superadmin: set the org's total + per-file limits. */
export async function adminSetStorageQuota(orgId: string, totalBytes: number, perFileBytes: number): Promise<void> {
    const { error } = await supabase.rpc('admin_set_org_storage_quota', { p_org: orgId, p_total: totalBytes, p_per_file: perFileBytes });
    if (error) throw error;
}

/** Owner: set the per-file limit (<= total). */
export async function setPerFileLimit(orgId: string, perFileBytes: number): Promise<void> {
    const { error } = await supabase.rpc('org_set_per_file_limit', { p_org: orgId, p_per_file: perFileBytes });
    if (error) throw error;
}

export async function cleanDrive(orgId: string): Promise<{ freed_bytes: number; removed: number }> {
    const { data, error } = await supabase.rpc('org_clean_drive', { p_org: orgId });
    if (error) throw error;
    const paths: string[] = (data?.removed_paths ?? []) as string[];
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
    return { freed_bytes: data?.freed_bytes ?? 0, removed: paths.length };
}

export async function uploadDocumentFile(input: {
    orgId: string; file: File; folder?: string | null; visibility?: 'org' | 'admin' | 'private';
}): Promise<string> {
    const { orgId, file } = input;
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}/${safeName}`;

    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (up.error) throw up.error;

    try {
        const { data, error } = await supabase.rpc('document_file_create', {
            p_org: orgId, p_title: file.name, p_folder: input.folder ?? null,
            p_file_path: path, p_mime: file.type || null, p_size: file.size,
            p_visibility: input.visibility ?? 'org',
        });
        if (error) throw error;
        return data as string;
    } catch (e) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        throw e;
    }
}

export async function documentFileUrl(filePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600);
    if (error) return null;
    return data?.signedUrl ?? null;
}

export async function deleteDocument(id: string): Promise<void> {
    const { data, error } = await supabase.rpc('document_delete', { p_id: id });
    if (error) throw error;
    const filePath: string | null = data?.file_path ?? null;
    if (filePath) await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {});
}

/* ───────────── links + cross-assign ───────────── */

export type EntityKind = 'task' | 'ticket' | 'project' | 'document' | 'discussion' | 'announcement';
export interface LinkedEntity { link_id: string; kind: EntityKind; entity_id: string; title: string | null; }

export async function entityLinksFor(type: EntityKind, id: string): Promise<LinkedEntity[]> {
    const { data, error } = await supabase.rpc('entity_links_for', { p_type: type, p_id: id });
    if (error) throw error;
    return (data ?? []) as LinkedEntity[];
}

export async function entityLinkCreate(orgId: string, sourceType: EntityKind, sourceId: string, targetType: EntityKind, targetId: string): Promise<string> {
    const { data, error } = await supabase.rpc('entity_link_create', { p_org: orgId, p_src_type: sourceType, p_src_id: sourceId, p_tgt_type: targetType, p_tgt_id: targetId });
    if (error) throw error;
    return data as string;
}

export async function entityLinkRemove(linkId: string): Promise<void> {
    const { error } = await supabase.rpc('entity_link_remove', { p_id: linkId });
    if (error) throw error;
}

export async function taskConvertType(taskId: string, type: 'task' | 'bug' | 'feature' | 'chore' | 'incident'): Promise<void> {
    const { error } = await supabase.rpc('task_convert_type', { p_task: taskId, p_type: type });
    if (error) throw error;
}

export async function taskAssignToProject(taskId: string, projectId: string | null): Promise<void> {
    const { error } = await supabase.rpc('task_assign_to_project', { p_task: taskId, p_project: projectId });
    if (error) throw error;
}

/* ───────────── helper ───────────── */

export function formatBytes(n: number): string {
    if (!n || n < 1024) return `${n || 0} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

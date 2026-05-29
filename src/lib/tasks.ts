/**
 * Tasks module — Supabase RPC wrappers.
 * Mirrors migrations 064–065. RLS enforces every operation.
 */

import { supabase } from './supabase';

export type TaskStatusCategory = 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskType = 'task' | 'bug' | 'feature' | 'chore' | 'incident';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export interface ProjectRow {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    team_id: string | null;
    owner_user_id: string | null;
    status: ProjectStatus;
    color: string | null;
    icon: string | null;
    start_date: string | null;
    target_date: string | null;
    task_count: number;
    open_task_count: number;
    archived_at: string | null;
    created_at: string;
}

export interface ProjectSection {
    id: string;
    name: string;
    type: 'section' | 'sprint' | 'milestone';
    position: number;
    start_date: string | null;
    end_date: string | null;
}

export interface ProjectMember {
    user_id: string;
    role: 'lead' | 'contributor' | 'viewer';
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
}

export interface ProjectDetail {
    project: any;
    sections: ProjectSection[];
    members: ProjectMember[];
}

export interface TaskRow {
    id: string;
    title: string;
    description: string | null;
    status: string;
    status_category: TaskStatusCategory | null;
    priority: TaskPriority | null;
    type: TaskType | null;
    assignee_user_id: string | null;
    assignee_name: string | null;
    assignee_avatar: string | null;
    due_date: string | null;
    start_date: string | null;
    completed_at: string | null;
    section_id: string | null;
    position: number | null;
    estimate_points: number | null;
    estimate_hours: number | null;
    visibility: string;
    created_at: string;
    updated_at: string;
}

export async function projectList(orgId: string): Promise<ProjectRow[]> {
    const { data, error } = await supabase.rpc('project_list', { p_org_id: orgId });
    if (error) throw error;
    return (data ?? []) as ProjectRow[];
}

export async function projectGet(projectId: string): Promise<ProjectDetail> {
    const { data, error } = await supabase.rpc('project_get', { p_project_id: projectId });
    if (error) throw error;
    return data as ProjectDetail;
}

export async function projectCreate(input: {
    orgId: string;
    name: string;
    slug?: string;
    teamId?: string;
    description?: string;
}): Promise<string> {
    const { data, error } = await supabase.rpc('project_create', {
        p_org_id: input.orgId,
        p_name: input.name,
        p_slug: input.slug ?? null,
        p_team_id: input.teamId ?? null,
        p_description: input.description ?? null,
    });
    if (error) throw error;
    return data as string;
}

export async function projectUpdate(input: {
    projectId: string;
    name?: string;
    description?: string;
    status?: ProjectStatus;
    teamId?: string;
    color?: string;
    icon?: string;
    startDate?: string;
    targetDate?: string;
}): Promise<void> {
    const { error } = await supabase.rpc('project_update', {
        p_project_id: input.projectId,
        p_name: input.name ?? null,
        p_description: input.description ?? null,
        p_status: input.status ?? null,
        p_team_id: input.teamId ?? null,
        p_color: input.color ?? null,
        p_icon: input.icon ?? null,
        p_start_date: input.startDate ?? null,
        p_target_date: input.targetDate ?? null,
    });
    if (error) throw error;
}

export async function projectArchive(projectId: string, archive = true): Promise<void> {
    const { error } = await supabase.rpc('project_archive', {
        p_project_id: projectId,
        p_archive: archive,
    });
    if (error) throw error;
}

export async function taskListForProject(projectId: string): Promise<TaskRow[]> {
    const { data, error } = await supabase.rpc('task_list_for_project', { p_project_id: projectId });
    if (error) throw error;
    return (data ?? []) as TaskRow[];
}

export async function taskOrgCreate(input: {
    orgId: string;
    title: string;
    description?: string;
    projectId?: string;
    sectionId?: string;
    teamId?: string;
    assigneeUserId?: string;
    priority?: TaskPriority;
    type?: TaskType;
    dueDate?: string;
    visibility?: 'private' | 'team' | 'org' | 'public';
    contactId?: string;
}): Promise<string> {
    const { data, error } = await supabase.rpc('task_org_create', {
        p_org_id: input.orgId,
        p_title: input.title,
        p_description: input.description ?? null,
        p_project_id: input.projectId ?? null,
        p_section_id: input.sectionId ?? null,
        p_team_id: input.teamId ?? null,
        p_assignee_user_id: input.assigneeUserId ?? null,
        p_priority: input.priority ?? 'medium',
        p_type: input.type ?? 'task',
        p_due_date: input.dueDate ?? null,
        p_visibility: input.visibility ?? 'team',
        p_contact_id: input.contactId ?? null,
    });
    if (error) throw error;
    return data as string;
}

export async function taskSetStatus(taskId: string, status: string, category?: TaskStatusCategory): Promise<void> {
    const { error } = await supabase.rpc('task_set_status', {
        p_task_id: taskId,
        p_status: status,
        p_category: category ?? null,
    });
    if (error) throw error;
}

export async function taskAssign(taskId: string, userId: string): Promise<void> {
    const { error } = await supabase.rpc('task_assign', { p_task_id: taskId, p_user_id: userId });
    if (error) throw error;
}

export async function taskAddComment(taskId: string, body: string, parentCommentId?: string): Promise<string> {
    const { data, error } = await supabase.rpc('task_add_comment', {
        p_task_id: taskId,
        p_body: body,
        p_parent_comment_id: parentCommentId ?? null,
    });
    if (error) throw error;
    return data as string;
}

export async function taskResolveComment(commentId: string, resolved: boolean = true): Promise<void> {
    const { error } = await supabase.rpc('task_resolve_comment', {
        p_comment_id: commentId,
        p_resolved: resolved,
    });
    if (error) throw error;
}

/* ───────────── task detail (direct queries) ───────────── */

export interface TaskCommentRow {
    id: string;
    task_id: string;
    author_user_id: string | null;
    parent_comment_id: string | null;
    body: string;
    resolved: boolean;
    created_at: string;
    updated_at: string;
    author?: { display_name: string | null; avatar_url: string | null; email: string | null };
}

export interface TaskActivityRow {
    id: string;
    task_id: string;
    actor_user_id: string | null;
    action: string;
    before: any;
    after: any;
    created_at: string;
}

export interface TaskAssigneeRow {
    user_id: string;
    is_primary: boolean;
    added_at: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
}

export interface TaskDependencyRow {
    task_id: string;
    depends_on_task_id: string;
    type: 'blocks' | 'blocked_by' | 'related';
    other_title?: string;
}

export interface TaskChecklistRow {
    id: string;
    title: string;
    position: number;
    items: Array<{
        id: string;
        content: string;
        done: boolean;
        position: number;
        assignee_user_id: string | null;
        due_date: string | null;
        completed_at: string | null;
    }>;
}

/**
 * Fetch a single task plus everything we need to render the detail
 * page in one pass: assignees, watchers, labels, checklists+items,
 * comments (newest first), activity, dependencies.
 */
export async function taskGetDetail(taskId: string): Promise<{
    task: any;
    assignees: TaskAssigneeRow[];
    watchers: TaskAssigneeRow[];
    comments: TaskCommentRow[];
    activity: TaskActivityRow[];
    dependencies: TaskDependencyRow[];
    checklists: TaskChecklistRow[];
}> {
    // Step 1: parallel pulls of every child row we need. No embeds —
    // we resolve user_id → profile in a second pass below so we don't
    // depend on PostgREST FK heuristics.
    const [taskRes, assigneesRes, watchersRes, commentsRes, activityRes, depsRes, checklistsRes, checklistItemsRes] =
        await Promise.all([
            supabase.from('tasks').select('*').eq('id', taskId).single(),
            supabase.from('task_assignees').select('user_id, is_primary, added_at').eq('task_id', taskId),
            supabase.from('task_watchers').select('user_id, added_at').eq('task_id', taskId),
            supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at', { ascending: true }),
            supabase.from('task_activity').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(50),
            supabase.from('task_dependencies').select('task_id, depends_on_task_id, type').eq('task_id', taskId),
            supabase.from('task_checklists').select('*').eq('task_id', taskId).order('position'),
            supabase.from('task_checklist_items').select('*').order('position'),
        ]);

    if (taskRes.error) throw taskRes.error;

    // Step 2: collect unique user_ids that need profile data.
    const userIds = new Set<string>();
    for (const r of assigneesRes.data ?? []) userIds.add((r as any).user_id);
    for (const r of watchersRes.data  ?? []) userIds.add((r as any).user_id);
    for (const r of commentsRes.data  ?? []) if ((r as any).author_user_id) userIds.add((r as any).author_user_id);

    let profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    if (userIds.size > 0) {
        const { data } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', Array.from(userIds));
        if (data) {
            profileMap = Object.fromEntries(data.map((p: any) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }]));
        }
    }

    // Step 3: also map dependency target IDs → task titles for the UI.
    const depIds = (depsRes.data ?? []).map((d: any) => d.depends_on_task_id);
    let titleMap: Record<string, string> = {};
    if (depIds.length > 0) {
        const { data } = await supabase.from('tasks').select('id, title').in('id', depIds);
        if (data) titleMap = Object.fromEntries(data.map((t: any) => [t.id, t.title]));
    }

    const normAssignee = (row: any): TaskAssigneeRow => ({
        user_id: row.user_id,
        is_primary: !!row.is_primary,
        added_at: row.added_at,
        display_name: profileMap[row.user_id]?.display_name ?? null,
        avatar_url: profileMap[row.user_id]?.avatar_url ?? null,
        email: null,
    });

    const normComment = (row: any): TaskCommentRow => ({
        id: row.id,
        task_id: row.task_id,
        author_user_id: row.author_user_id,
        parent_comment_id: row.parent_comment_id,
        body: row.body,
        resolved: row.resolved,
        created_at: row.created_at,
        updated_at: row.updated_at,
        author: row.author_user_id
            ? { display_name: profileMap[row.author_user_id]?.display_name ?? null,
                avatar_url:   profileMap[row.author_user_id]?.avatar_url ?? null,
                email: null }
            : { display_name: null, avatar_url: null, email: null },
    });

    const checklistMap = new Map<string, TaskChecklistRow>();
    for (const c of checklistsRes.data ?? []) {
        checklistMap.set((c as any).id, { id: (c as any).id, title: (c as any).title, position: (c as any).position, items: [] });
    }
    for (const it of checklistItemsRes.data ?? []) {
        const list = checklistMap.get((it as any).checklist_id);
        if (list) list.items.push(it as any);
    }

    const deps: TaskDependencyRow[] = (depsRes.data ?? []).map((d: any) => ({
        task_id: d.task_id,
        depends_on_task_id: d.depends_on_task_id,
        type: d.type,
        other_title: titleMap[d.depends_on_task_id],
    }));

    return {
        task: taskRes.data,
        assignees: (assigneesRes.data ?? []).map(normAssignee),
        watchers:  (watchersRes.data ?? []).map(normAssignee),
        comments:  (commentsRes.data ?? []).map(normComment),
        activity:  (activityRes.data ?? []) as TaskActivityRow[],
        dependencies: deps,
        checklists: Array.from(checklistMap.values()),
    };
}

export async function taskAddWatcher(taskId: string, userId: string) {
    const { error } = await supabase.from('task_watchers').insert({ task_id: taskId, user_id: userId });
    if (error) throw error;
}

export async function taskRemoveWatcher(taskId: string, userId: string) {
    const { error } = await supabase.from('task_watchers')
        .delete().eq('task_id', taskId).eq('user_id', userId);
    if (error) throw error;
}

export async function taskAddAssignee(taskId: string, userId: string) {
    const { error } = await supabase.from('task_assignees')
        .insert({ task_id: taskId, user_id: userId, is_primary: false });
    if (error) throw error;
}

export async function taskRemoveAssignee(taskId: string, userId: string) {
    const { error } = await supabase.from('task_assignees')
        .delete().eq('task_id', taskId).eq('user_id', userId);
    if (error) throw error;
}

export async function taskUpdateFields(taskId: string, fields: Partial<{
    title: string;
    description: string;
    priority: TaskPriority;
    type: TaskType;
    due_date: string | null;
    start_date: string | null;
    estimate_points: number | null;
    estimate_hours: number | null;
    visibility: 'private' | 'team' | 'org' | 'public';
}>) {
    const { error } = await supabase.from('tasks').update(fields).eq('id', taskId);
    if (error) throw error;
}

export async function taskSetDependency(taskId: string, dependsOnTaskId: string, type: 'blocks' | 'blocked_by' | 'related' = 'blocks') {
    const { error } = await supabase.rpc('task_set_dependency', {
        p_task_id: taskId,
        p_depends_on_task_id: dependsOnTaskId,
        p_type: type,
    });
    if (error) throw error;
}

export async function taskRemoveDependency(taskId: string, dependsOnTaskId: string, type: 'blocks' | 'blocked_by' | 'related' = 'blocks') {
    const { error } = await supabase.rpc('task_remove_dependency', {
        p_task_id: taskId,
        p_depends_on_task_id: dependsOnTaskId,
        p_type: type,
    });
    if (error) throw error;
}

export async function checklistCreate(taskId: string, title: string): Promise<string> {
    const { data, error } = await supabase.from('task_checklists')
        .insert({ task_id: taskId, title }).select('id').single();
    if (error) throw error;
    return data.id;
}

export async function checklistItemCreate(checklistId: string, content: string): Promise<string> {
    const { data, error } = await supabase.from('task_checklist_items')
        .insert({ checklist_id: checklistId, content }).select('id').single();
    if (error) throw error;
    return data.id;
}

export async function checklistItemToggle(itemId: string, done: boolean) {
    const { error } = await supabase.from('task_checklist_items')
        .update({ done, completed_at: done ? new Date().toISOString() : null })
        .eq('id', itemId);
    if (error) throw error;
}

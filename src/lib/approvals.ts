/**
 * Transaction approvals — Supabase RPC wrappers.
 * Mirrors migration 067.
 */

import { supabase } from './supabase';

export interface PendingTxnRow {
    id: string;
    amount: number;
    currency: string;
    category: string | null;
    status: string;
    approval_status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'none';
    transaction_date: string | null;
    notes: string | null;
    submitter_user_id: string;
    submitter_name: string | null;
    submitter_avatar: string | null;
    contact_id: string | null;
    contact_name: string | null;
    created_at: string;
}

export async function txnListPendingForOrg(orgId: string): Promise<PendingTxnRow[]> {
    const { data, error } = await supabase.rpc('txn_list_pending_for_org', { p_org_id: orgId });
    if (error) throw error;
    return (data ?? []) as PendingTxnRow[];
}

export async function txnRequestApproval(txnId: string, note?: string) {
    const { error } = await supabase.rpc('txn_request_approval', {
        p_txn_id: txnId, p_note: note ?? null,
    });
    if (error) throw error;
}

export async function txnApprove(txnId: string, note?: string) {
    const { error } = await supabase.rpc('txn_approve', {
        p_txn_id: txnId, p_note: note ?? null,
    });
    if (error) throw error;
}

export async function txnReject(txnId: string, note?: string) {
    const { error } = await supabase.rpc('txn_reject', {
        p_txn_id: txnId, p_note: note ?? null,
    });
    if (error) throw error;
}

export async function txnMarkExecuted(txnId: string) {
    const { error } = await supabase.rpc('txn_mark_executed', { p_txn_id: txnId });
    if (error) throw error;
}

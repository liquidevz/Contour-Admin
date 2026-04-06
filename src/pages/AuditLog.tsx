import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ScrollText, Filter } from 'lucide-react';

const PAGE_SIZE = 30;

export default function AuditLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('all');

  useEffect(() => { loadLogs(); }, [page, actionFilter]);

  async function loadLogs() {
    setLoading(true);
    let query = supabase.from('admin_audit_logs_with_admin')
      .select('*', { count: 'exact' });

    if (actionFilter !== 'all') query = query.eq('action', actionFilter);

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    setLogs(data || []);
    setTotal(count || 0);
    setLoading(false);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const actionColors: Record<string, string> = {
    approve_user: 'badge-success',
    bulk_approve: 'badge-success',
    reject_user: 'badge-error',
    revoke_access: 'badge-error',
    delete_message: 'badge-error',
    delete_offer: 'badge-error',
    delete_want: 'badge-error',
    deactivate_offer: 'badge-warning',
    deactivate_want: 'badge-warning',
    reactivate_offer: 'badge-success',
    reactivate_want: 'badge-success',
    enable_flag: 'badge-success',
    disable_flag: 'badge-warning',
    review_flag_dismiss: 'badge-info',
    review_flag_remove_listing: 'badge-error',
  };

  return (
    <div>
      <div className="page-header">
        <h1>Audit Log</h1>
        <p>Complete history of admin actions</p>
      </div>

      <div className="data-card">
        <div className="data-card-header">
          <span className="data-card-title"><ScrollText size={16} /> Activity Log</span>
          <div className="filter-bar">
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            <select className="select-field" value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }}>
              <option value="all">All Actions</option>
              <option value="approve_user">Approve User</option>
              <option value="reject_user">Reject User</option>
              <option value="bulk_approve">Bulk Approve</option>
              <option value="revoke_access">Revoke Access</option>
              <option value="delete_message">Delete Message</option>
              <option value="deactivate_offer">Deactivate Offer</option>
              <option value="deactivate_want">Deactivate Want</option>
              <option value="enable_flag">Enable Flag</option>
              <option value="disable_flag">Disable Flag</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-state"><div className="spinner" /></div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><ScrollText size={24} /></div>
            <h3>No audit logs</h3>
            <p>Admin actions will appear here</p>
          </div>
        ) : (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Entity ID</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td>
                        <div className="user-cell">
                          <div className="user-cell-avatar">
                            {log.admin_avatar ? <img src={log.admin_avatar} alt="" /> : (log.admin_name || '?')[0].toUpperCase()}
                          </div>
                          <span className="user-cell-name" style={{ fontSize: '0.82rem' }}>
                            {log.admin_name || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${actionColors[log.action] || 'badge-info'}`}>
                          {log.action?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td><span className="tag-chip">{log.entity}</span></td>
                      <td className="mono" style={{ fontSize: '0.75rem' }}>{log.entity_id?.slice(0, 8)}…</td>
                      <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Page {page + 1} of {totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

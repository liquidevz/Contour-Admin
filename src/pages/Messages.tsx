import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MessageSquare, Trash2, Search } from 'lucide-react';

const PAGE_SIZE = 30;

export default function Messages() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => { loadMessages(); }, [page]);

  async function loadMessages() {
    setLoading(true);
    const { data, count } = await supabase.from('profile_messages')
      .select(`
        id, message, created_at,
        sender:profiles!profile_messages_sender_profile_id_fkey(id, display_name, username, avatar_url),
        receiver:profiles!profile_messages_receiver_profile_id_fkey(id, display_name, username, avatar_url)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    setMessages(data || []);
    setTotal(count || 0);
    setLoading(false);
  }

  async function deleteMessage(messageId: string) {
    if (!confirm('Delete this message permanently?')) return;
    await supabase.from('profile_messages').delete().eq('id', messageId);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('admin_audit_logs').insert({
      admin_id: user.id, action: 'delete_message', entity: 'profile_messages', entity_id: messageId,
    });
    setMessages(prev => prev.filter(m => m.id !== messageId));
    setTotal(t => t - 1);
  }

  const filtered = messages.filter(m =>
    !search || (m.message || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.sender?.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.receiver?.display_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Messages</h1>
        <p>{total} messages across the platform</p>
      </div>

      <div className="data-card">
        <div className="data-card-header">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              className="input-field"
              placeholder="Search messages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 280 }}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><MessageSquare size={24} /></div>
            <h3>No messages</h3>
            <p>No messages have been sent on the platform</p>
          </div>
        ) : (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sender</th>
                    <th>Receiver</th>
                    <th>Message</th>
                    <th>Sent</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(msg => (
                    <tr key={msg.id}>
                      <td>
                        <div className="user-cell">
                          <div className="user-cell-avatar">
                            {msg.sender?.avatar_url ? <img src={msg.sender.avatar_url} alt="" /> : (msg.sender?.display_name || '?')[0].toUpperCase()}
                          </div>
                          <span className="user-cell-name" style={{ fontSize: '0.82rem' }}>
                            {msg.sender?.display_name || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="user-cell">
                          <div className="user-cell-avatar">
                            {msg.receiver?.avatar_url ? <img src={msg.receiver.avatar_url} alt="" /> : (msg.receiver?.display_name || '?')[0].toUpperCase()}
                          </div>
                          <span className="user-cell-name" style={{ fontSize: '0.82rem' }}>
                            {msg.receiver?.display_name || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {msg.message}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {new Date(msg.created_at).toLocaleString()}
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteMessage(msg.id)}>
                          <Trash2 size={14} />
                        </button>
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

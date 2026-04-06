import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Flag, Check, Trash2 } from 'lucide-react';

export default function Reports() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadFlags(); }, []);

  async function loadFlags() {
    const { data } = await supabase.from('listing_flags')
      .select('*')
      .eq('reviewed', false)
      .order('created_at', { ascending: true });
    setFlags(data || []);
    setLoading(false);
  }

  async function reviewFlag(flagId: string, action: 'dismiss' | 'remove_listing') {
    await supabase.from('listing_flags').update({ reviewed: true }).eq('id', flagId);

    if (action === 'remove_listing') {
      const { data: flag } = await supabase.from('listing_flags')
        .select('listing_id, listing_type').eq('id', flagId).single();
      if (flag) {
        const table = flag.listing_type === 'offer' ? 'user_offers' : 'user_wants';
        await supabase.from(table).update({ is_active: false }).eq('id', flag.listing_id);
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('admin_audit_logs').insert({
      admin_id: user.id, action: `review_flag_${action}`, entity: 'listing_flags', entity_id: flagId,
    });

    setFlags(prev => prev.filter(f => f.id !== flagId));
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
        <p>{flags.length} flagged {flags.length === 1 ? 'listing' : 'listings'} pending review</p>
      </div>

      <div className="data-card">
        {flags.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Flag size={24} /></div>
            <h3>No pending reports</h3>
            <p>All flagged content has been reviewed</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Listing ID</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>Reported</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {flags.map(flag => (
                  <tr key={flag.id}>
                    <td className="mono">{flag.listing_id?.slice(0, 8)}…</td>
                    <td><span className="tag-chip">{flag.listing_type}</span></td>
                    <td style={{ maxWidth: 300 }}>{flag.reason || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {new Date(flag.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="btn-group">
                        <button className="btn btn-ghost btn-sm" onClick={() => reviewFlag(flag.id, 'dismiss')}>
                          <Check size={14} /> Dismiss
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => reviewFlag(flag.id, 'remove_listing')}>
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

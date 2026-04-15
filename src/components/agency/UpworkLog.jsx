import { useState } from 'react';
import { useAgencyStore } from '../../store/agencyStore';

const SERVICE_TYPES = ['brand_identity', 'website', 'combo', 'other'];
const STATUSES = ['applied', 'viewed', 'shortlisted', 'interview', 'won', 'lost', 'no_response'];

const STATUS_LABEL = {
  applied:     'Applied',
  viewed:      'Viewed',
  shortlisted: 'Shortlisted',
  interview:   'Interview',
  won:         'Won',
  lost:        'Lost',
  no_response: 'No Response',
};

const STATUS_CLASS = {
  applied:     'agency-badge-blue',
  viewed:      'agency-badge-purple',
  shortlisted: 'agency-badge-orange',
  interview:   'agency-badge-orange',
  won:         'agency-badge-green',
  lost:        'agency-badge-grey',
  no_response: 'agency-badge-grey',
};

const EMPTY = {
  job_title: '', job_url: '', service_type: 'brand_identity',
  bid_amount: '', cover_letter_note: '',
  applied_date: new Date().toISOString().split('T')[0],
  status: 'applied', notes: '',
};

export default function UpworkLog() {
  const {
    upworkProposals,
    addUpworkProposal, updateUpworkProposal, deleteUpworkProposal,
    getProposalsNeedingUpworkFollowUp,
  } = useAgencyStore();

  const [showAdd,    setShowAdd]    = useState(false);
  const [editProposal, setEditProposal] = useState(null);
  const [form,       setForm]       = useState(EMPTY);
  const [statusOpen, setStatusOpen] = useState(null); // proposal id with open status dropdown

  const today     = new Date().toISOString().split('T')[0];
  const followUps = getProposalsNeedingUpworkFollowUp();

  // Stats
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthProposals = upworkProposals.filter(p => p.applied_date?.startsWith(thisMonth));
  const wonCount   = monthProposals.filter(p => p.status === 'won').length;
  const totalCount = monthProposals.length;
  const successRate = totalCount > 0 ? Math.round((wonCount / totalCount) * 100) : 0;
  const avgBid = totalCount > 0
    ? Math.round(monthProposals.reduce((s, p) => s + Number(p.bid_amount || 0), 0) / totalCount)
    : 0;

  function openAdd()    { setForm(EMPTY); setEditProposal(null); setShowAdd(true); }
  function openEdit(p)  {
    setForm({
      job_title: p.job_title, job_url: p.job_url || '', service_type: p.service_type,
      bid_amount: p.bid_amount || '', cover_letter_note: p.cover_letter_note || '',
      applied_date: p.applied_date, status: p.status, notes: p.notes || '',
    });
    setEditProposal(p);
    setShowAdd(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (editProposal) {
      updateUpworkProposal(editProposal.id, { ...form });
    } else {
      addUpworkProposal({ ...form });
    }
    setShowAdd(false);
  }

  function markFollowUp(p) {
    updateUpworkProposal(p.id, { follow_up_sent: true, follow_up_date: today });
  }

  function changeStatus(id, status) {
    updateUpworkProposal(id, { status });
    setStatusOpen(null);
  }

  // Sort by applied_date descending
  const sorted = [...upworkProposals].sort((a, b) => (b.applied_date || '').localeCompare(a.applied_date || ''));

  function daysSince(dateStr) {
    if (!dateStr) return 0;
    return Math.floor((new Date() - new Date(dateStr)) / 86400000);
  }

  return (
    <div className="agency-page">

      {/* Header */}
      <div className="agency-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="agency-page-title">Upwork Proposals</div>
          {followUps.length > 0 && (
            <span className="agency-badge agency-badge-orange">⚠ {followUps.length} follow-up{followUps.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <button className="agency-btn agency-btn-primary" onClick={openAdd}>+ Log Proposal</button>
      </div>

      {/* Stats row */}
      <div className="agency-stats-row" style={{ marginBottom: 16 }}>
        <div className="agency-stat-card">
          <div className="agency-stat-number">{totalCount}</div>
          <div className="agency-stat-label">Applied this month</div>
        </div>
        <div className="agency-stat-card">
          <div className="agency-stat-number" style={{ color: '#22c55e' }}>{wonCount}</div>
          <div className="agency-stat-label">Won</div>
        </div>
        <div className="agency-stat-card">
          <div className="agency-stat-number" style={{ color: successRate >= 20 ? '#22c55e' : successRate >= 10 ? '#f59e0b' : '#ef4444' }}>
            {successRate}%
          </div>
          <div className="agency-stat-label">Success rate</div>
        </div>
        <div className="agency-stat-card">
          <div className="agency-stat-number">${avgBid}</div>
          <div className="agency-stat-label">Avg bid</div>
        </div>
      </div>

      {/* Follow-up alert banner */}
      {followUps.length > 0 && (
        <div className="agency-alert-banner" style={{ marginBottom: 16 }}>
          <strong>⚠ {followUps.length} proposal{followUps.length > 1 ? 's' : ''} need a follow-up (5+ days, no response):</strong>{' '}
          {followUps.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ' · '}
              <strong>{p.job_title}</strong>
              <span style={{ color: '#92400e' }}> ({daysSince(p.applied_date)}d)</span>
            </span>
          ))}
        </div>
      )}

      {/* Proposals table */}
      {sorted.length === 0 ? (
        <div className="agency-card" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14 }}>No proposals logged yet. Click <strong>+ Log Proposal</strong> to start tracking.</div>
        </div>
      ) : (
        <div className="agency-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="agency-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Job Title</th>
                <th>Service</th>
                <th>Bid (USD)</th>
                <th>Status</th>
                <th>Follow-up</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const days      = daysSince(p.applied_date);
                const needsFollowUp = p.status === 'applied' && days >= 5 && !p.follow_up_sent;
                const isStatusOpen  = statusOpen === p.id;

                return (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }}>{p.applied_date}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                        {p.job_url ? (
                          <a href={p.job_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0057B8', textDecoration: 'none' }}>
                            {p.job_title}
                          </a>
                        ) : p.job_title}
                      </div>
                      {p.cover_letter_note && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>↳ {p.cover_letter_note}</div>
                      )}
                      {p.notes && (
                        <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 1 }}>{p.notes}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: '#475569', textTransform: 'capitalize' }}>
                      {p.service_type?.replace(/_/g, ' ')}
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                      {p.bid_amount ? `$${p.bid_amount}` : '—'}
                    </td>
                    <td style={{ position: 'relative' }}>
                      <button
                        className={`agency-badge ${STATUS_CLASS[p.status]}`}
                        style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
                        onClick={() => setStatusOpen(isStatusOpen ? null : p.id)}
                        title="Click to change status"
                      >
                        {STATUS_LABEL[p.status]} ▾
                      </button>
                      {isStatusOpen && (
                        <div style={{
                          position: 'absolute', zIndex: 50, top: '100%', left: 0,
                          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 7,
                          boxShadow: '0 4px 16px rgba(0,0,0,.1)', minWidth: 140, padding: 4,
                        }}>
                          {STATUSES.map(s => (
                            <button
                              key={s}
                              onClick={() => changeStatus(p.id, s)}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '6px 10px', fontSize: 12, background: p.status === s ? '#f1f5f9' : 'transparent',
                                border: 'none', cursor: 'pointer', borderRadius: 4, color: '#334155',
                              }}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {p.follow_up_sent ? (
                        <span style={{ fontSize: 11, color: '#22c55e' }}>✓ {p.follow_up_date || 'Done'}</span>
                      ) : needsFollowUp ? (
                        <button
                          className="agency-btn agency-btn-secondary agency-btn-sm"
                          style={{ fontSize: 10, background: '#fff7ed', borderColor: '#f97316', color: '#ea580c' }}
                          onClick={() => markFollowUp(p)}
                        >
                          ⚠ Follow up ({days}d)
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => openEdit(p)}>Edit</button>
                        <button className="agency-btn agency-btn-danger agency-btn-sm" onClick={() => { if (confirm(`Delete "${p.job_title}"?`)) deleteUpworkProposal(p.id); }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      {showAdd && (
        <div className="agency-modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="agency-modal">
            <div className="agency-modal-title">{editProposal ? 'Edit Proposal' : 'Log Proposal'}</div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Job Title *</label>
                  <input className="agency-form-input" required value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} placeholder="e.g. Brand Identity for SaaS Startup" />
                </div>

                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Job URL</label>
                  <input className="agency-form-input" type="url" value={form.job_url} onChange={e => setForm(f => ({ ...f, job_url: e.target.value }))} placeholder="https://www.upwork.com/jobs/..." />
                </div>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Service Type</label>
                  <select className="agency-form-select" value={form.service_type} onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}>
                    {SERVICE_TYPES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Bid Amount (USD)</label>
                  <input className="agency-form-input" type="number" value={form.bid_amount} onChange={e => setForm(f => ({ ...f, bid_amount: e.target.value }))} placeholder="0" />
                </div>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Applied Date *</label>
                  <input className="agency-form-input" type="date" required value={form.applied_date} onChange={e => setForm(f => ({ ...f, applied_date: e.target.value }))} />
                </div>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Status</label>
                  <select className="agency-form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>

                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Cover Letter Angle</label>
                  <input className="agency-form-input" value={form.cover_letter_note} onChange={e => setForm(f => ({ ...f, cover_letter_note: e.target.value }))} placeholder="e.g. Led with startup launch case study" />
                </div>

                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Notes</label>
                  <textarea className="agency-form-textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
                </div>

              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="agency-btn agency-btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="agency-btn agency-btn-primary">{editProposal ? 'Save Changes' : 'Log Proposal'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

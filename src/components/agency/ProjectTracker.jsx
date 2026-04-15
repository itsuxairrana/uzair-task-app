import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAgencyStore } from '../../store/agencyStore';

const SERVICES = ['brand_identity', 'website', 'video', 'social_media'];
const SERVICE_LABEL = { brand_identity: 'Brand Identity', website: 'Website', video: 'Video', social_media: 'Social Media' };

const DELIVERABLE_TEMPLATES = {
  brand_identity: ['Logo concepts (3 options)', 'Color palette', 'Typography system', 'Brand guidelines PDF', 'Source files packaged', 'Client approval'],
  website:        ['Wireframe approved', 'Homepage built', 'Inner pages built', 'SEO setup (Rank Math)', 'Mobile check', 'Client review round 1', 'Revisions applied', 'Final delivery'],
  video:          ['Brief received', 'Script approved', 'Rough cut sent', 'Revision applied', 'Final export', 'Delivered'],
  social_media:   ['Calendar approved', 'Week 1 done', 'Week 2 done', 'Week 3 done', 'Week 4 done', 'Monthly report'],
};

const EMPTY = { client_name: '', service: 'brand_identity', deadline: '', notes: '' };

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date(new Date().toISOString().split('T')[0])) / 86400000);
}

export default function ProjectTracker() {
  const { projects, addProject, updateProject, deleteProject, toggleDeliverableReviewed, toggleDeliverableDone } = useAgencyStore();

  const [showAdd,    setShowAdd]    = useState(false);
  const [editProj,   setEditProj]   = useState(null);
  const [form,       setForm]       = useState(EMPTY);
  const [expanded,   setExpanded]   = useState({});   // { [projectId]: bool }

  function openAdd()   { setForm(EMPTY); setEditProj(null); setShowAdd(true); }
  function openEdit(p) { setForm({ client_name: p.client_name, service: p.service, deadline: p.deadline, notes: p.notes }); setEditProj(p); setShowAdd(true); }

  function handleSubmit(e) {
    e.preventDefault();
    if (editProj) {
      updateProject(editProj.id, { client_name: form.client_name, service: form.service, deadline: form.deadline, notes: form.notes });
    } else {
      const deliverables = (DELIVERABLE_TEMPLATES[form.service] || []).map(title => ({
        id: uuidv4(), title, done: false, uzair_reviewed: false,
      }));
      addProject({ ...form, revision_round: 1, deliverables });
    }
    setShowAdd(false);
  }

  function newRevisionRound(p) {
    const reset = p.deliverables.map(d => ({ ...d, done: false, uzair_reviewed: false }));
    updateProject(p.id, { revision_round: (p.revision_round || 1) + 1, deliverables: reset });
  }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // Sort: projects with nearest deadline first; no deadline last
  const sorted = [...projects].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  });

  return (
    <div className="agency-page">

      {/* Header */}
      <div className="agency-page-header">
        <div className="agency-page-title">Project Tracker</div>
        <button className="agency-btn agency-btn-primary" onClick={openAdd}>+ Add Project</button>
      </div>

      {/* Project cards */}
      {sorted.length === 0 ? (
        <div className="agency-card" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          <div style={{ fontSize: 14 }}>No active projects. Click <strong>+ Add Project</strong> to start.</div>
        </div>
      ) : (
        sorted.map(p => {
          const total     = p.deliverables?.length || 0;
          const done      = p.deliverables?.filter(d => d.done).length || 0;
          const pct       = total > 0 ? Math.round((done / total) * 100) : 0;
          const days      = daysUntil(p.deadline);
          const urgent    = days !== null && days <= 3;
          const overdue   = days !== null && days < 0;
          const isExpanded = expanded[p.id];

          return (
            <div key={p.id} className="agency-card" style={{ marginBottom: 12 }}>

              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{p.client_name}</span>
                    <span className="agency-badge agency-badge-blue" style={{ fontSize: 10 }}>{SERVICE_LABEL[p.service] || p.service}</span>
                    {p.revision_round > 1 && (
                      <span className="agency-badge agency-badge-grey" style={{ fontSize: 10 }}>Rev {p.revision_round}</span>
                    )}
                  </div>
                  {p.deadline && (
                    <div style={{ fontSize: 12, marginTop: 4, color: overdue ? '#b91c1c' : urgent ? '#d97706' : '#64748b', fontWeight: overdue || urgent ? 600 : 400 }}>
                      {overdue ? `⚠ Overdue by ${Math.abs(days)}d` : urgent ? `⚡ Due in ${days}d` : `Due ${p.deadline}`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => openEdit(p)}>Edit</button>
                  <button className="agency-btn agency-btn-danger agency-btn-sm" onClick={() => { if (confirm(`Delete project for ${p.client_name}?`)) deleteProject(p.id); }}>✕</button>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                  <span>{done}/{total} deliverables</span>
                  <span>{pct}%</span>
                </div>
                <div className="agency-progress-wrap" style={{ height: 7 }}>
                  <div className={'agency-progress-fill' + (pct === 100 ? ' complete' : '')} style={{ width: pct + '%' }} />
                </div>
              </div>

              {/* Expand / collapse deliverables */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  className="agency-btn agency-btn-secondary agency-btn-sm"
                  onClick={() => toggleExpand(p.id)}
                  style={{ fontSize: 11 }}
                >
                  {isExpanded ? '▲ Hide steps' : '▼ Show steps'}
                </button>
                <button
                  className="agency-btn agency-btn-secondary agency-btn-sm"
                  onClick={() => { if (confirm(`Start revision round ${(p.revision_round || 1) + 1}? This resets all deliverable checkboxes.`)) newRevisionRound(p); }}
                  style={{ fontSize: 11 }}
                >
                  ↺ New revision round
                </button>
              </div>

              {/* Deliverable list */}
              {isExpanded && (
                <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                  {(p.deliverables || []).map((d, idx) => (
                    <div
                      key={d.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 0',
                        borderBottom: idx < p.deliverables.length - 1 ? '1px solid #f8fafc' : 'none',
                        opacity: d.done ? 0.6 : 1,
                      }}
                    >
                      {/* Step number */}
                      <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 18, textAlign: 'right' }}>{idx + 1}.</span>

                      {/* Done checkbox — disabled until reviewed */}
                      <input
                        type="checkbox"
                        checked={!!d.done}
                        disabled={!d.uzair_reviewed}
                        onChange={() => toggleDeliverableDone(p.id, d.id)}
                        title={d.uzair_reviewed ? 'Mark done' : 'Review first before marking done'}
                        style={{ cursor: d.uzair_reviewed ? 'pointer' : 'not-allowed', accentColor: '#0057B8', width: 15, height: 15, flexShrink: 0 }}
                      />

                      {/* Title */}
                      <span style={{
                        flex: 1, fontSize: 13, color: '#334155',
                        textDecoration: d.done ? 'line-through' : 'none',
                      }}>
                        {d.title}
                      </span>

                      {/* Reviewed toggle */}
                      <button
                        className={'agency-btn agency-btn-sm ' + (d.uzair_reviewed ? 'agency-btn-primary' : 'agency-btn-secondary')}
                        onClick={() => toggleDeliverableReviewed(p.id, d.id)}
                        style={{ fontSize: 10, whiteSpace: 'nowrap' }}
                        title="Toggle Uzair reviewed"
                      >
                        {d.uzair_reviewed ? '✓ Reviewed' : 'Review'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              {p.notes && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                  {p.notes}
                </div>
              )}

            </div>
          );
        })
      )}

      {/* Add / Edit modal */}
      {showAdd && (
        <div className="agency-modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="agency-modal">
            <div className="agency-modal-title">{editProj ? 'Edit Project' : 'Add Project'}</div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Client Name *</label>
                  <input
                    className="agency-form-input"
                    required
                    value={form.client_name}
                    onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                    placeholder="e.g. Horizon Media"
                  />
                </div>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Service</label>
                  <select
                    className="agency-form-select"
                    value={form.service}
                    onChange={e => setForm(f => ({ ...f, service: e.target.value }))}
                    disabled={!!editProj}
                  >
                    {SERVICES.map(s => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}
                  </select>
                  {!editProj && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>Sets deliverable checklist (can't change after add)</div>}
                </div>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Deadline</label>
                  <input
                    className="agency-form-input"
                    type="date"
                    value={form.deadline}
                    onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                  />
                </div>

                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Notes</label>
                  <textarea
                    className="agency-form-textarea"
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    placeholder="Optional project notes"
                  />
                </div>

              </div>

              {!editProj && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 12, color: '#64748b' }}>
                  📋 Deliverables will be pre-filled from the <strong>{SERVICE_LABEL[form.service]}</strong> template ({DELIVERABLE_TEMPLATES[form.service]?.length} steps)
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="agency-btn agency-btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="agency-btn agency-btn-primary">{editProj ? 'Save Changes' : 'Add Project'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

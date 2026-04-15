import { useState } from 'react';
import { useAgencyStore } from '../../store/agencyStore';

const STAGES = ['lead','proposal','active','delivered','retainer','closed'];
const STAGE_LABEL = { lead:'Lead', proposal:'Proposal', active:'Active', delivered:'Delivered', retainer:'Retainer', closed:'Closed' };
const SERVICES  = ['brand_identity','website','video','social_media','combo','other'];
const PLATFORMS = ['fiverr','upwork','contra','linkedin','reddit','direct'];
const LEAD_SRCS = [
  { id:'company',         label:'Company' },
  { id:'junaid_direct',   label:'Junaid Direct' },
  { id:'junaid_ig',       label:'Junaid IG' },
  { id:'junaid_referral', label:'Junaid Referral' },
];
const CURRENCIES = ['PKR','USD','GBP'];

const EMPTY = { name:'', service:'brand_identity', platform:'direct', value:'', currency:'USD', lead_source:'company', notes:'', stage:'lead' };

function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((new Date() - new Date(dateStr)) / 86400000);
}

function daysInStage(client) {
  return daysSince(client.updated_at || client.created_at);
}

export default function ClientPipeline() {
  const { clients, addClient, updateClient, deleteClient, moveClient, getProposalsNeedingFollowUp, addInvoice, toPKR } = useAgencyStore();

  const [showAdd, setShowAdd]       = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [form, setForm]             = useState(EMPTY);
  const [invPrompt, setInvPrompt]   = useState(null); // { client }

  const followUps = getProposalsNeedingFollowUp();

  function openAdd()  { setForm(EMPTY); setEditClient(null); setShowAdd(true); }
  function openEdit(c){ setForm({ ...c }); setEditClient(c); setShowAdd(true); }

  function handleSubmit(e) {
    e.preventDefault();
    if (editClient) {
      updateClient(editClient.id, { ...form });
    } else {
      addClient({ ...form });
    }
    setShowAdd(false);
  }

  function handleMove(client, newStage) {
    moveClient(client.id, newStage);
    if (newStage === 'delivered') {
      setInvPrompt(client);
    }
  }

  function handleCreateInvoice(client) {
    const today = new Date().toISOString().split('T')[0];
    const due   = new Date(Date.now() + 7*86400000).toISOString().split('T')[0];
    addInvoice({ client_name: client.name, amount: client.value, currency: client.currency, delivered_date: today, due_date: due, notes: '' });
    setInvPrompt(null);
  }

  // Column totals
  function colTotal(stage) {
    return clients.filter(c => c.stage === stage).reduce((s,c) => s + toPKR(Number(c.value||0), c.currency), 0);
  }

  function pkrFmt(n) { return n >= 1000 ? 'PKR ' + Math.round(n/1000) + 'k' : n > 0 ? 'PKR ' + Math.round(n) : ''; }

  const nextStageMap = { lead:'proposal', proposal:'active', active:'delivered', delivered:'retainer', retainer:'closed' };

  return (
    <div className="agency-page" style={{ maxWidth: '100%' }}>

      {/* Header */}
      <div className="agency-page-header">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div className="agency-page-title">Client Pipeline</div>
          {followUps.length > 0 && (
            <span className="agency-badge agency-badge-orange">⚠ {followUps.length} follow-up{followUps.length>1?'s':''}</span>
          )}
        </div>
        <button className="agency-btn agency-btn-primary" onClick={openAdd}>+ Add Client</button>
      </div>

      {/* Follow-up banner */}
      {followUps.length > 0 && (
        <div className="agency-alert-banner" style={{ marginBottom: 16 }}>
          <strong>⚠ Proposals needing follow-up: </strong>
          {followUps.map((c,i) => (
            <span key={c.id}>
              {i > 0 && ' · '}
              <strong>{c.name}</strong>
              <span style={{ color: c.days_waiting >= 5 ? '#b91c1c' : '#92400e' }}> ({c.days_waiting} days)</span>
            </span>
          ))}
        </div>
      )}

      {/* Kanban */}
      <div className="agency-kanban">
        {STAGES.map(stage => {
          const cols = clients.filter(c => c.stage === stage);
          const total = colTotal(stage);
          return (
            <div key={stage} className="agency-kanban-col" style={{ minWidth: 220 }}>
              <div className="agency-kanban-col-header">
                <span>{STAGE_LABEL[stage]}</span>
                <span style={{ background:'rgba(0,0,0,.06)', borderRadius:99, padding:'1px 7px', fontSize:10 }}>{cols.length}</span>
                {total > 0 && <span style={{ marginLeft:'auto', fontSize:10, color:'#94a3b8' }}>{pkrFmt(total)}</span>}
              </div>

              {cols.map(c => {
                const days    = daysInStage(c);
                const isJunaid = c.lead_source && c.lead_source !== 'company';
                const propDays = c.stage === 'proposal' ? daysSince(c.proposal_sent_date) : 0;
                const followUp = c.stage === 'proposal' && propDays >= 2;
                const urgent   = c.stage === 'proposal' && propDays >= 5;
                const nextStage = nextStageMap[c.stage];

                return (
                  <div key={c.id} className="agency-client-card">
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:4 }}>
                      <div className="agency-client-name" style={{ flex:1 }}>
                        {isJunaid && <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#f97316', marginRight:5, verticalAlign:'middle' }} />}
                        {c.name}
                      </div>
                    </div>

                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:5 }}>
                      <span className="agency-badge agency-badge-blue" style={{ fontSize:10 }}>{c.service?.replace('_',' ')}</span>
                      <span className="agency-badge agency-badge-grey" style={{ fontSize:10 }}>{c.platform}</span>
                    </div>

                    {c.value && (
                      <div style={{ fontSize:12, fontWeight:600, color:'#1e293b', marginBottom:3 }}>
                        {c.value} {c.currency}
                      </div>
                    )}

                    <div style={{ fontSize:11, color:'#94a3b8', marginBottom:5 }}>{days}d in stage</div>

                    {followUp && (
                      <div style={{ marginBottom:5 }}>
                        <span className={`agency-badge ${urgent ? 'agency-badge-red' : 'agency-badge-orange'}`} style={{ fontSize:10 }}>
                          {urgent ? `Urgent! (${propDays}d)` : `Follow up! (${propDays}d)`}
                        </span>
                      </div>
                    )}

                    <div style={{ display:'flex', gap:5, marginTop:4 }}>
                      {nextStage && (
                        <button className="agency-btn agency-btn-primary agency-btn-sm" onClick={() => handleMove(c, nextStage)}>
                          → {STAGE_LABEL[nextStage]}
                        </button>
                      )}
                      <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => openEdit(c)}>Edit</button>
                      <button className="agency-btn agency-btn-danger agency-btn-sm" onClick={() => { if(confirm(`Delete ${c.name}?`)) deleteClient(c.id); }}>✕</button>
                    </div>
                  </div>
                );
              })}

              {cols.length === 0 && (
                <div style={{ fontSize:12, color:'#cbd5e1', textAlign:'center', padding:'12px 0' }}>Empty</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add / Edit modal */}
      {showAdd && (
        <div className="agency-modal-overlay" onClick={e => e.target===e.currentTarget && setShowAdd(false)}>
          <div className="agency-modal">
            <div className="agency-modal-title">{editClient ? 'Edit Client' : 'Add Client'}</div>
            <form onSubmit={handleSubmit}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="agency-form-row" style={{ margin:0, gridColumn:'1 / -1' }}>
                  <label className="agency-form-label">Client Name *</label>
                  <input className="agency-form-input" required value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Apex Digital" />
                </div>
                <div className="agency-form-row" style={{ margin:0 }}>
                  <label className="agency-form-label">Service</label>
                  <select className="agency-form-select" value={form.service} onChange={e => setForm(f=>({...f,service:e.target.value}))}>
                    {SERVICES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                  </select>
                </div>
                <div className="agency-form-row" style={{ margin:0 }}>
                  <label className="agency-form-label">Platform</label>
                  <select className="agency-form-select" value={form.platform} onChange={e => setForm(f=>({...f,platform:e.target.value}))}>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="agency-form-row" style={{ margin:0 }}>
                  <label className="agency-form-label">Value</label>
                  <input className="agency-form-input" type="number" value={form.value} onChange={e => setForm(f=>({...f,value:e.target.value}))} placeholder="0" />
                </div>
                <div className="agency-form-row" style={{ margin:0 }}>
                  <label className="agency-form-label">Currency</label>
                  <select className="agency-form-select" value={form.currency} onChange={e => setForm(f=>({...f,currency:e.target.value}))}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="agency-form-row" style={{ margin:0, gridColumn:'1 / -1' }}>
                  <label className="agency-form-label">Lead Source</label>
                  <select className="agency-form-select" value={form.lead_source} onChange={e => setForm(f=>({...f,lead_source:e.target.value}))}>
                    {LEAD_SRCS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                <div className="agency-form-row" style={{ margin:0, gridColumn:'1 / -1' }}>
                  <label className="agency-form-label">Notes</label>
                  <textarea className="agency-form-textarea" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} rows={2} />
                </div>
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
                <button type="button" className="agency-btn agency-btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="agency-btn agency-btn-primary">{editClient ? 'Save Changes' : 'Add Client'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice prompt when moved to Delivered */}
      {invPrompt && (
        <div className="agency-modal-overlay">
          <div className="agency-modal" style={{ width:380 }}>
            <div className="agency-modal-title">Create Invoice?</div>
            <p style={{ fontSize:13, color:'#475569', marginBottom:20 }}>
              Create an unpaid invoice for <strong>{invPrompt.name}</strong>?<br />
              Amount: <strong>{invPrompt.value} {invPrompt.currency}</strong> · Due in 7 days
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="agency-btn agency-btn-secondary" onClick={() => setInvPrompt(null)}>No thanks</button>
              <button className="agency-btn agency-btn-primary" onClick={() => handleCreateInvoice(invPrompt)}>Yes, create invoice</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

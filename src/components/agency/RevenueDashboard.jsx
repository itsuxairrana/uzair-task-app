import { useState } from 'react';
import { useAgencyStore } from '../../store/agencyStore';

const SOURCES = ['fiverr','upwork','contra','direct','voice_agent','templates','affiliates'];
const LEAD_SOURCES = [
  { id: 'company',         label: 'Company (0%)' },
  { id: 'junaid_direct',   label: 'Junaid Direct (30%)' },
  { id: 'junaid_ig',       label: 'Junaid IG (20%)' },
  { id: 'junaid_referral', label: 'Junaid Referral (15%)' },
];
const CURRENCIES = ['PKR','USD','GBP'];

const EMPTY_ENTRY = { amount: '', currency: 'USD', source: 'fiverr', lead_source: 'company', client_name: '', direct_cost: '', date: new Date().toISOString().split('T')[0], notes: '' };
const EMPTY_INV   = { client_name: '', amount: '', currency: 'USD', delivered_date: new Date().toISOString().split('T')[0], due_date: '', notes: '' };

function pkrFmt(n) { return 'PKR ' + Math.round(n).toLocaleString(); }

export default function RevenueDashboard() {
  const {
    revenueEntries, revenueSettings, invoices,
    addRevenue, deleteRevenue, updateRevenueSettings,
    toPKR, getThisMonthEntries, getThisMonthTotalPKR, getJunaidCommissionThisMonth,
    addInvoice, markInvoicePaid, deleteInvoice, getUnpaidInvoices, getOverdueInvoices,
  } = useAgencyStore();

  const [showLogModal, setShowLogModal]   = useState(false);
  const [showInvModal, setShowInvModal]   = useState(false);
  const [entry, setEntry]                 = useState(EMPTY_ENTRY);
  const [inv, setInv]                     = useState(EMPTY_INV);
  const [settings, setSettings]           = useState(revenueSettings);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const today        = new Date().toISOString().split('T')[0];
  const monthEntries = getThisMonthEntries();
  const totalPKR     = getThisMonthTotalPKR();
  const target       = revenueSettings.monthlyTarget;
  const remaining    = Math.max(0, target - totalPKR);
  const pct          = Math.min(100, Math.round((totalPKR / target) * 100));
  const commission   = getJunaidCommissionThisMonth();
  const unpaid       = getUnpaidInvoices();
  const overdue      = getOverdueInvoices();

  // Currency breakdown for summary line
  const usdTotal = monthEntries.filter(e => e.currency === 'USD').reduce((s,e) => s + Number(e.amount||0), 0);
  const gbpTotal = monthEntries.filter(e => e.currency === 'GBP').reduce((s,e) => s + Number(e.amount||0), 0);
  const pkrDirect= monthEntries.filter(e => e.currency === 'PKR').reduce((s,e) => s + Number(e.amount||0), 0);

  // By-source totals for bar chart
  const bySource = SOURCES.map(s => ({
    s,
    total: monthEntries.filter(e => e.source === s).reduce((sum,e) => sum + toPKR(Number(e.amount||0), e.currency), 0),
  })).filter(x => x.total > 0).sort((a,b) => b.total - a.total);
  const maxSource = bySource[0]?.total || 1;

  function saveSettings() {
    updateRevenueSettings({ monthlyTarget: Number(settings.monthlyTarget), usdRate: Number(settings.usdRate), gbpRate: Number(settings.gbpRate) });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  function handleLog(e) {
    e.preventDefault();
    addRevenue(entry);
    setEntry(EMPTY_ENTRY);
    setShowLogModal(false);
  }

  function handleAddInv(e) {
    e.preventDefault();
    const due = inv.due_date || (() => { const d = new Date(inv.delivered_date); d.setDate(d.getDate()+7); return d.toISOString().split('T')[0]; })();
    addInvoice({ ...inv, due_date: due });
    setInv(EMPTY_INV);
    setShowInvModal(false);
  }

  const daysOverdue = (due) => Math.floor((new Date() - new Date(due)) / 86400000);

  return (
    <div className="agency-page">

      {/* Header */}
      <div className="agency-page-header">
        <div className="agency-page-title">Revenue Dashboard</div>
        <button className="agency-btn agency-btn-primary" onClick={() => setShowLogModal(true)}>
          + Log Income
        </button>
      </div>

      {/* Settings row */}
      <div className="agency-card" style={{ padding: '14px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {[
            { label: 'Monthly Target (PKR)', key: 'monthlyTarget' },
            { label: 'USD → PKR rate', key: 'usdRate' },
            { label: 'GBP → PKR rate', key: 'gbpRate' },
          ].map(f => (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569', minWidth: 140 }}>
              {f.label}
              <input
                className="agency-form-input"
                type="number"
                value={settings[f.key]}
                onChange={e => setSettings(s => ({ ...s, [f.key]: e.target.value }))}
                style={{ width: 140 }}
              />
            </label>
          ))}
          <button
            className={'agency-btn ' + (settingsSaved ? 'agency-btn-primary' : 'agency-btn-secondary')}
            onClick={saveSettings}
            style={{ alignSelf: 'flex-end' }}
          >
            {settingsSaved ? '✓ Saved' : 'Save Rates'}
          </button>
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="agency-stats-row">
        <div className="agency-stat-card">
          <div className="agency-stat-number">{pkrFmt(totalPKR)}</div>
          <div className="agency-stat-label">This month</div>
        </div>
        <div className="agency-stat-card">
          <div className="agency-stat-number">{pkrFmt(target)}</div>
          <div className="agency-stat-label">Target</div>
        </div>
        <div className="agency-stat-card">
          <div className="agency-stat-number" style={{ color: remaining > 0 ? '#ef4444' : '#22c55e' }}>{pkrFmt(remaining)}</div>
          <div className="agency-stat-label">Remaining</div>
        </div>
        <div className="agency-stat-card">
          <div className="agency-stat-number" style={{ color: pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444' }}>{pct}%</div>
          <div className="agency-stat-label">Complete</div>
        </div>
      </div>

      {/* Progress bar + currency summary */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div className="agency-progress-wrap" style={{ height: 12, marginBottom: 10 }}>
          <div className={'agency-progress-fill' + (pct >= 100 ? ' complete' : '')} style={{ width: pct + '%' }} />
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {usdTotal > 0 && <span>${usdTotal.toLocaleString()} USD</span>}
          {usdTotal > 0 && (gbpTotal > 0 || pkrDirect > 0) && <span style={{ margin: '0 6px' }}>+</span>}
          {gbpTotal > 0 && <span>£{gbpTotal.toLocaleString()} GBP</span>}
          {gbpTotal > 0 && pkrDirect > 0 && <span style={{ margin: '0 6px' }}>+</span>}
          {pkrDirect > 0 && <span>PKR {pkrDirect.toLocaleString()}</span>}
          {(usdTotal > 0 || gbpTotal > 0) && <span style={{ margin: '0 6px', color: '#94a3b8' }}>= ~{pkrFmt(totalPKR)}</span>}
          {monthEntries.length === 0 && <span style={{ color: '#94a3b8' }}>No income logged this month</span>}
        </div>
      </div>

      {/* Junaid commission box */}
      {commission.total > 0 && (
        <div className="agency-commission-box" style={{ marginBottom: 14 }}>
          <div className="agency-commission-total">Junaid earned: {pkrFmt(commission.total)}</div>
          <div className="agency-commission-breakdown">
            {commission.breakdown.junaid_direct > 0 && <span>Direct: {pkrFmt(commission.breakdown.junaid_direct)} · </span>}
            {commission.breakdown.junaid_ig > 0 && <span>IG: {pkrFmt(commission.breakdown.junaid_ig)} · </span>}
            {commission.breakdown.junaid_referral > 0 && <span>Referral: {pkrFmt(commission.breakdown.junaid_referral)}</span>}
          </div>
        </div>
      )}

      {/* Outstanding Payments / Invoices */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Outstanding Payments</span>
          <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => setShowInvModal(true)}>+ Add Invoice</button>
        </div>

        {overdue.length > 0 && (
          <div className="agency-danger-banner" style={{ marginBottom: 12 }}>
            {overdue.length} overdue — {pkrFmt(overdue.reduce((s,i) => s + toPKR(Number(i.amount||0), i.currency), 0))} outstanding
          </div>
        )}

        {unpaid.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>No outstanding invoices</div>
        ) : (
          <table className="agency-table">
            <thead>
              <tr><th>Client</th><th>Amount</th><th>Delivered</th><th>Due</th><th>Overdue</th><th></th></tr>
            </thead>
            <tbody>
              {unpaid.map(inv => {
                const od = inv.due_date && inv.due_date < today;
                const days = od ? daysOverdue(inv.due_date) : 0;
                return (
                  <tr key={inv.id} className={od ? 'overdue' : ''}>
                    <td style={{ fontWeight: 500 }}>{inv.client_name}</td>
                    <td>{inv.amount} {inv.currency}</td>
                    <td>{inv.delivered_date || '—'}</td>
                    <td>{inv.due_date || '—'}</td>
                    <td>{od ? <span className="agency-badge agency-badge-red">{days}d</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => markInvoicePaid(inv.id)}>✓ Paid</button>
                      <button className="agency-btn agency-btn-danger agency-btn-sm" onClick={() => deleteInvoice(inv.id)}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* By-source bar chart */}
      {bySource.length > 0 && (
        <div className="agency-card" style={{ marginBottom: 14 }}>
          <div className="morning-section-label" style={{ marginBottom: 12 }}>Income by Source</div>
          {bySource.map(({ s, total }) => (
            <div key={s} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
                <span style={{ color: '#475569', textTransform: 'capitalize' }}>{s.replace('_',' ')}</span>
                <span style={{ color: '#64748b' }}>{pkrFmt(total)}</span>
              </div>
              <div style={{ background: '#f1f5f9', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, background: '#0057B8', width: Math.round((total / maxSource) * 100) + '%', transition: 'width .3s' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Received payments table */}
      {monthEntries.length > 0 && (
        <div className="agency-card">
          <div className="morning-section-label" style={{ marginBottom: 12 }}>Received This Month</div>
          <table className="agency-table">
            <thead>
              <tr><th>Date</th><th>Client</th><th>Source</th><th>Amount</th><th>PKR equiv</th><th>Junaid %</th><th></th></tr>
            </thead>
            <tbody>
              {[...monthEntries].sort((a,b) => b.date.localeCompare(a.date)).map(e => {
                const pkr = toPKR(Number(e.amount||0), e.currency);
                const rateMap = { junaid_direct:'30%', junaid_ig:'20%', junaid_referral:'15%' };
                return (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{e.client_name || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{e.source?.replace('_',' ')}</td>
                    <td>{e.amount} {e.currency}</td>
                    <td>{pkrFmt(pkr)}</td>
                    <td>{rateMap[e.lead_source] ? <span className="agency-badge agency-badge-orange">{rateMap[e.lead_source]}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                    <td><button className="agency-btn agency-btn-danger agency-btn-sm" onClick={() => deleteRevenue(e.id)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Income modal */}
      {showLogModal && (
        <div className="agency-modal-overlay" onClick={e => e.target === e.currentTarget && setShowLogModal(false)}>
          <div className="agency-modal">
            <div className="agency-modal-title">Log Income</div>
            <form onSubmit={handleLog}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Amount *', key: 'amount', type: 'number', required: true, full: false },
                  { label: 'Client Name', key: 'client_name', type: 'text', full: false },
                  { label: 'Direct Cost (PKR)', key: 'direct_cost', type: 'number', full: false },
                  { label: 'Date *', key: 'date', type: 'date', required: true, full: false },
                ].map(f => (
                  <div key={f.key} className="agency-form-row" style={{ margin: 0 }}>
                    <label className="agency-form-label">{f.label}</label>
                    <input className="agency-form-input" type={f.type} required={f.required} value={entry[f.key]} onChange={e => setEntry(x => ({ ...x, [f.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Currency</label>
                  <select className="agency-form-select" value={entry.currency} onChange={e => setEntry(x => ({ ...x, currency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Source</label>
                  <select className="agency-form-select" value={entry.source} onChange={e => setEntry(x => ({ ...x, source: e.target.value }))}>
                    {SOURCES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                  </select>
                </div>
                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Lead Source (for Junaid commission)</label>
                  <select className="agency-form-select" value={entry.lead_source} onChange={e => setEntry(x => ({ ...x, lead_source: e.target.value }))}>
                    {LEAD_SOURCES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="agency-form-row" style={{ marginTop: 12 }}>
                <label className="agency-form-label">Notes</label>
                <textarea className="agency-form-textarea" value={entry.notes} onChange={e => setEntry(x => ({ ...x, notes: e.target.value }))} rows={2} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="agency-btn agency-btn-secondary" onClick={() => setShowLogModal(false)}>Cancel</button>
                <button type="submit" className="agency-btn agency-btn-primary">Log Income</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Invoice modal */}
      {showInvModal && (
        <div className="agency-modal-overlay" onClick={e => e.target === e.currentTarget && setShowInvModal(false)}>
          <div className="agency-modal">
            <div className="agency-modal-title">Add Invoice</div>
            <form onSubmit={handleAddInv}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Client Name *</label>
                  <input className="agency-form-input" required value={inv.client_name} onChange={e => setInv(x => ({ ...x, client_name: e.target.value }))} />
                </div>
                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Amount *</label>
                  <input className="agency-form-input" type="number" required value={inv.amount} onChange={e => setInv(x => ({ ...x, amount: e.target.value }))} />
                </div>
                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Currency</label>
                  <select className="agency-form-select" value={inv.currency} onChange={e => setInv(x => ({ ...x, currency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Delivered Date</label>
                  <input className="agency-form-input" type="date" value={inv.delivered_date} onChange={e => setInv(x => ({ ...x, delivered_date: e.target.value }))} />
                </div>
                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Due Date (blank = +7 days)</label>
                  <input className="agency-form-input" type="date" value={inv.due_date} onChange={e => setInv(x => ({ ...x, due_date: e.target.value }))} />
                </div>
                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Notes</label>
                  <textarea className="agency-form-textarea" value={inv.notes} onChange={e => setInv(x => ({ ...x, notes: e.target.value }))} rows={2} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="agency-btn agency-btn-secondary" onClick={() => setShowInvModal(false)}>Cancel</button>
                <button type="submit" className="agency-btn agency-btn-primary">Add Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

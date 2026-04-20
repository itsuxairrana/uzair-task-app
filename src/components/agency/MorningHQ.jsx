import { useState, useEffect } from 'react';
import { useAgencyStore } from '../../store/agencyStore';
import { useTaskStore } from '../../store/taskStore';

const EMPTY_PLATFORM = { id: '', name: '', color: '#0057B8', tasks: '' };

const DAILY_THEME = {
  1: { label: 'Outreach day',          sub: 'Reddit + Discord + LinkedIn connections + Behance',      tasks: ['Post [FOR HIRE] on Reddit','Message in Discord server','Send 10 LinkedIn connections','Update Behance case study'] },
  2: { label: 'Content day',           sub: 'LinkedIn post #1 + Instagram + client work',             tasks: ['Publish LinkedIn post #1','Post Instagram Story','Work on active client project','Reply to all DMs & comments'] },
  3: { label: 'Portfolio + Discovery', sub: 'Dribbble + research + Discord',                          tasks: ['Post/comment on Dribbble','Research 3 prospects','Post in Discord community','Review analytics'] },
  4: { label: 'Content + Learning',    sub: 'LinkedIn post #2 + 90 min learning block',               tasks: ['Publish LinkedIn post #2','90 min learning block','Follow up on proposals','Check Upwork messages'] },
  5: { label: 'Publishing day',        sub: 'LinkedIn post #3 + Blog post + Pinterest',               tasks: ['Publish LinkedIn post #3','Publish blog post','Post 3 Pinterest pins','Weekly invoice check'] },
  6: { label: 'Deep work',             sub: 'Client delivery only, no social',                        tasks: ['Deliver client work','No social media','Review project feedback','Plan next week\'s content'] },
  0: { label: 'Planning day',          sub: 'Cowork workers + Weekly Review + load calendar',         tasks: ['Brief Cowork workers','Complete Weekly Review','Load content calendar','Set top 3 goals for Monday'] },
};

const THEME_CHECKS_PREFIX = 'uzair_daily_theme_checks_';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtTime(d) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

const PRI_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };

export default function MorningHQ() {
  const {
    getTodayChecks, togglePlatformCheck, computeStreak,
    projects, getProposalsNeedingFollowUp, getProposalsNeedingUpworkFollowUp,
    updateClient, contentPosts, getUnpaidInvoices, updateUpworkProposal,
    getOverdueInvoices, getThisMonthTotalPKR, revenueSettings,
    platforms, addPlatform, updatePlatform, removePlatform,
  } = useAgencyStore();

  const [showPlatformEdit, setShowPlatformEdit] = useState(false);
  const [editingPlatform,  setEditingPlatform]  = useState(null);
  const [platformForm,     setPlatformForm]     = useState(EMPTY_PLATFORM);

  const todayDOW   = now.getDay();
  const todayTheme = DAILY_THEME[todayDOW];
  const themeKey   = THEME_CHECKS_PREFIX + todayStr;
  const [themeChecks, setThemeChecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(themeKey)) || {}; } catch { return {}; }
  });
  function toggleThemeCheck(idx) {
    const updated = { ...themeChecks, [idx]: !themeChecks[idx] };
    setThemeChecks(updated);
    localStorage.setItem(themeKey, JSON.stringify(updated));
  }
  const themeDone  = todayTheme.tasks.filter((_, i) => themeChecks[i]).length;
  const themeTotal = todayTheme.tasks.length;

  function openAddPlatform() { setPlatformForm({ ...EMPTY_PLATFORM }); setEditingPlatform(null); }
  function openEditPlatform(p) { setPlatformForm({ id: p.id, name: p.name, color: p.color, tasks: p.tasks }); setEditingPlatform(p); }
  function handlePlatformSubmit(e) {
    e.preventDefault();
    if (editingPlatform) {
      updatePlatform(editingPlatform.id, { name: platformForm.name, color: platformForm.color, tasks: platformForm.tasks });
    } else {
      const id = platformForm.name.toLowerCase().replace(/\s+/g, '_');
      addPlatform({ id, name: platformForm.name, color: platformForm.color, tasks: platformForm.tasks });
    }
    setEditingPlatform(null);
    setPlatformForm(EMPTY_PLATFORM);
  }

  const { getTodayTasks, setTaskStatus } = useTaskStore();

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const todayStr = now.toISOString().split('T')[0];
  const todayChecks = getTodayChecks();
  const streak = computeStreak();

  // ── Priority signal: first matching rule wins ──
  function getPrioritySignal() {
    // Rule 1 — overdue invoices
    const overdueInv = getOverdueInvoices();
    if (overdueInv.length > 0)
      return `You have ${overdueInv.length} overdue invoice${overdueInv.length > 1 ? 's' : ''} — chase payments first.`;

    // Rule 2 — revenue behind
    const monthPKR  = getThisMonthTotalPKR();
    const target    = revenueSettings?.monthlyTarget || 300000;
    const daysLeft  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    if (monthPKR < target * 0.4 && daysLeft > 15)
      return `Revenue is behind — post a For Hire on Reddit and Upwork today.`;

    // Rule 3 — Upwork follow-ups
    const upwFU = getProposalsNeedingUpworkFollowUp();
    if (upwFU.length >= 2) {
      const days = Math.floor((new Date() - new Date(upwFU[0].applied_date)) / 86400000);
      return `Follow up on "${upwFU[0].job_title}" and "${upwFU[1].job_title}" on Upwork — waiting ${days} days.`;
    }

    // Rule 4 — pipeline follow-ups
    const pipeFU = getProposalsNeedingFollowUp();
    if (pipeFU.length >= 2) {
      const days = pipeFU[0].days_waiting;
      return `Contact ${pipeFU[0].name} and ${pipeFU[1].name} — proposals sent ${days} days ago.`;
    }

    // Rule 5 — no content today and no content next 7 days
    const next7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() + i); return d.toISOString().split('T')[0];
    });
    const hasContent = contentPosts.some(p => next7.includes(p.date));
    if (!hasContent)
      return `Content calendar is empty — open it and plan 3 posts now.`;

    // Rule 6 — project past deadline
    const overdueProj = (projects || []).find(p => p.deadline && p.deadline < todayStr && p.deliverables?.some(d => !d.done));
    if (overdueProj)
      return `${overdueProj.client_name} project is past deadline.`;

    // Rule 7 — low streak
    if (streak < 3)
      return `Your streak is ${streak} day${streak !== 1 ? 's' : ''} — check all ${platforms.length} platforms today.`;

    // Rule 8 — all clear
    return `All clear — focus on delivering active projects.`;
  }
  const prioritySignal = getPrioritySignal();
  const donePlatforms = platforms.filter(p => todayChecks[p.id]).length;

  const todayTasks = getTodayTasks().filter(t => t.status !== 'done');
  const todayTasksShown = todayTasks.slice(0, 5);

  const activeProjects = projects
    .filter(p => p.deliverables?.some(d => !d.done))
    .slice(0, 3);

  const clientFollowUps = getProposalsNeedingFollowUp();
  const upworkFollowUps = getProposalsNeedingUpworkFollowUp();
  const todayContent    = contentPosts.filter(p => p.date === todayStr);
  const unpaidInvoices  = getUnpaidInvoices();

  const urgentDate = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

  return (
    <div className="morning-hq">

      {/* ── Section 1: Greeting ── */}
      <div style={{ marginBottom: 20 }}>
        <div className="morning-hq-greeting">{getGreeting()}, Uzair</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="morning-hq-date">{fmtDate(now)} · {fmtTime(now)}</div>
          {streak > 0 && (
            <span className="agency-badge agency-badge-orange" style={{ fontSize: 11, padding: '3px 10px' }}>
              🔥 {streak} day streak
            </span>
          )}
        </div>
      </div>

      {/* ── Priority signal box ── */}
      <div className="agency-smart-action">
        <div className="agency-smart-action-label">💡 Priority signal</div>
        <div className="agency-smart-action-text">{prioritySignal}</div>
      </div>

      {/* ── Section 2: Platform chips ── */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="morning-section-label" style={{ marginBottom: 0 }}>
            Platforms — {donePlatforms}/{platforms.length} done today
          </div>
          <button
            onClick={() => setShowPlatformEdit(true)}
            title="Edit platforms"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: '2px 4px', lineHeight: 1 }}
          >✏</button>
        </div>
        <div className="morning-hq-platform-chips">
          {platforms.map(p => (
            <button
              key={p.id}
              className={'platform-chip' + (todayChecks[p.id] ? ' done' : '')}
              onClick={() => togglePlatformCheck(p.id)}
              style={{ borderColor: todayChecks[p.id] ? p.color + '99' : undefined }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
              {p.name}
              {todayChecks[p.id] && <span style={{ color: '#16a34a', fontSize: 11 }}>✓</span>}
            </button>
          ))}
        </div>
        {platforms.length > 0 && donePlatforms === platforms.length && (
          <div className="agency-success-banner" style={{ marginTop: 10, marginBottom: 0 }}>
            🎯 All platforms active today!
          </div>
        )}
      </div>

      {/* ── Platform edit modal ── */}
      {showPlatformEdit && (
        <div className="agency-modal-overlay" onClick={e => e.target === e.currentTarget && setShowPlatformEdit(false)}>
          <div className="agency-modal" style={{ maxWidth: 480 }}>
            <div className="agency-modal-title">Edit Platforms</div>
            <div style={{ marginBottom: 16 }}>
              {platforms.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                  <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => openEditPlatform(p)}>Edit</button>
                  <button className="agency-btn agency-btn-danger agency-btn-sm" onClick={() => { if (confirm(`Remove ${p.name}?`)) removePlatform(p.id); }}>✕</button>
                </div>
              ))}
            </div>
            {editingPlatform === null && platformForm.name === '' ? (
              <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={openAddPlatform}>+ Add Platform</button>
            ) : (
              <form onSubmit={handlePlatformSubmit} style={{ marginTop: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginBottom: 8 }}>
                  <div className="agency-form-row" style={{ margin: 0 }}>
                    <label className="agency-form-label">Name</label>
                    <input className="agency-form-input" required value={platformForm.name} onChange={e => setPlatformForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Twitter" />
                  </div>
                  <div className="agency-form-row" style={{ margin: 0 }}>
                    <label className="agency-form-label">Color</label>
                    <input type="color" value={platformForm.color} onChange={e => setPlatformForm(f => ({ ...f, color: e.target.value }))} style={{ width: '100%', height: 36, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
                  </div>
                </div>
                <div className="agency-form-row" style={{ margin: '0 0 8px' }}>
                  <label className="agency-form-label">Daily tasks</label>
                  <input className="agency-form-input" value={platformForm.tasks} onChange={e => setPlatformForm(f => ({ ...f, tasks: e.target.value }))} placeholder="Task 1 · Task 2 · Task 3" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => { setEditingPlatform(null); setPlatformForm(EMPTY_PLATFORM); }}>Cancel</button>
                  <button type="submit" className="agency-btn agency-btn-primary agency-btn-sm">{editingPlatform ? 'Save' : 'Add'}</button>
                </div>
              </form>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="agency-btn agency-btn-secondary" onClick={() => setShowPlatformEdit(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Today's focus card ── */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div className="morning-section-label" style={{ marginBottom: 2 }}>{todayTheme.label}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{todayTheme.sub}</div>
          </div>
          <span className="agency-badge agency-badge-blue" style={{ fontSize: 11 }}>{themeDone}/{themeTotal}</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          {todayTheme.tasks.map((task, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < themeTotal - 1 ? '1px solid #f8fafc' : 'none' }}>
              <button
                onClick={() => toggleThemeCheck(i)}
                style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                  border: `1.5px solid ${themeChecks[i] ? '#22c55e' : '#cbd5e1'}`,
                  background: themeChecks[i] ? '#22c55e' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                {themeChecks[i] && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}
              </button>
              <span style={{ fontSize: 13, color: themeChecks[i] ? '#94a3b8' : '#334155', textDecoration: themeChecks[i] ? 'line-through' : 'none' }}>
                {task}
              </span>
            </div>
          ))}
        </div>
        <div style={{ background: '#f1f5f9', borderRadius: 99, height: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: themeDone === themeTotal ? '#22c55e' : '#0057B8', width: `${Math.round((themeDone / themeTotal) * 100)}%`, borderRadius: 99, transition: 'width .3s' }} />
        </div>
      </div>

      {/* ── Sections 3 + 4: Tasks + Projects grid ── */}
      <div className="morning-hq-grid">

        {/* Today's tasks */}
        <div className="agency-card">
          <div className="morning-section-label" style={{ marginBottom: 8 }}>Today's tasks</div>
          {todayTasksShown.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8', padding: '4px 0' }}>No tasks due today</div>
          ) : todayTasksShown.map(task => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRI_COLOR[task.priority], flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#334155', flex: 1, lineHeight: 1.3 }}>{task.title}</span>
              <button
                onClick={() => setTaskStatus(task.id, 'done')}
                title="Mark done"
                style={{
                  background: 'none', border: '1.5px solid #cbd5e1', borderRadius: 5,
                  width: 20, height: 20, cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#64748b', transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.color = '#22c55e'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#64748b'; }}
              >✓</button>
            </div>
          ))}
          {todayTasks.length > 5 && (
            <div style={{ fontSize: 12, color: '#0057B8', marginTop: 8, cursor: 'pointer' }}>
              +{todayTasks.length - 5} more tasks →
            </div>
          )}
        </div>

        {/* Active projects */}
        <div className="agency-card">
          <div className="morning-section-label" style={{ marginBottom: 8 }}>Active projects</div>
          {activeProjects.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8', padding: '4px 0' }}>No active projects</div>
          ) : activeProjects.map(p => {
            const nextDel = p.deliverables?.find(d => !d.uzair_reviewed && !d.done);
            const isUrgent = p.deadline && p.deadline <= urgentDate;
            return (
              <div key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1 }}>{p.client_name}</span>
                  {isUrgent && (
                    <span className="agency-badge agency-badge-red" style={{ fontSize: 10 }}>Due soon</span>
                  )}
                </div>
                {nextDel && (
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 1 }}>Next: {nextDel.title}</div>
                )}
                {p.deadline && (
                  <div style={{ fontSize: 11, color: isUrgent ? '#ef4444' : '#94a3b8' }}>
                    Deadline: {p.deadline}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 5a: Client follow-ups ── */}
      {clientFollowUps.length > 0 && (
        <div className="agency-alert-banner">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            ⚠ {clientFollowUps.length} client proposal{clientFollowUps.length !== 1 ? 's' : ''} need a follow-up
          </div>
          {clientFollowUps.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 13, flex: 1 }}>
                {c.name} — <span style={{ color: '#b45309' }}>{c.days_waiting} days waiting</span>
              </span>
              <button
                className="agency-btn agency-btn-secondary agency-btn-sm"
                onClick={() => updateClient(c.id, { proposal_sent_date: new Date().toISOString().split('T')[0] })}
              >
                Mark followed up
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Section 5b: Upwork follow-ups ── */}
      {upworkFollowUps.length > 0 && (
        <div className="agency-alert-banner">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            ⚠ {upworkFollowUps.length} Upwork application{upworkFollowUps.length !== 1 ? 's' : ''} need follow-up
          </div>
          {upworkFollowUps.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 13, flex: 1 }}>
                {p.job_title} — <span style={{ color: '#b45309' }}>{p.days_waiting} days</span>
              </span>
              <button
                className="agency-btn agency-btn-secondary agency-btn-sm"
                onClick={() => updateUpworkProposal(p.id, {
                  follow_up_sent: true,
                  follow_up_date: new Date().toISOString().split('T')[0],
                })}
              >
                Mark followed up
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Section 6: Today's content ── */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div className="morning-section-label" style={{ marginBottom: 8 }}>Today's content</div>
        {todayContent.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>No content planned — add something</div>
        ) : todayContent.map(post => (
          <div key={post.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
            <span className="agency-badge agency-badge-blue" style={{ fontSize: 10 }}>{post.platform}</span>
            <span style={{ fontSize: 13, color: '#334155', flex: 1 }}>{post.topic}</span>
            <span className={`agency-badge ${
              post.status === 'posted' ? 'agency-badge-green' :
              post.status === 'ready'  ? 'agency-badge-blue'  :
              post.status === 'drafted' ? 'agency-badge-orange' :
              'agency-badge-grey'
            }`} style={{ fontSize: 10 }}>{post.status}</span>
          </div>
        ))}
      </div>

      {/* ── Section 7: Unpaid invoices ── */}
      {unpaidInvoices.length > 0 && (
        <div className="agency-danger-banner">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            💰 {unpaidInvoices.length} invoice{unpaidInvoices.length !== 1 ? 's' : ''} unpaid
          </div>
          {unpaidInvoices.slice(0, 3).map(inv => {
            const overdue = inv.due_date && inv.due_date < todayStr;
            const days = inv.due_date
              ? Math.floor((new Date() - new Date(inv.due_date)) / 86400000)
              : 0;
            return (
              <div key={inv.id} style={{ fontSize: 12, color: '#b91c1c', marginBottom: 2 }}>
                {inv.client_name} · {inv.amount} {inv.currency}
                {overdue && days > 0 ? ` (${days}d overdue)` : ''}
              </div>
            );
          })}
          {unpaidInvoices.length > 3 && (
            <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>
              +{unpaidInvoices.length - 3} more in Revenue dashboard
            </div>
          )}
        </div>
      )}

    </div>
  );
}

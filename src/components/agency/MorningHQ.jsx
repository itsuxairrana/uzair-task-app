import { useState, useEffect } from 'react';
import { useAgencyStore } from '../../store/agencyStore';
import { useTaskStore } from '../../store/taskStore';
import { useUiStore } from '../../store/uiStore';
import { useTeamStore } from '../../store/teamStore';
import Icon from '../Icon';

function CardHead({ title, sub, to, label = 'View all', right }) {
  const navigate = useUiStore(s => s.navigate);
  return (
    <div className="card-head">
      <div>
        <div className="card-title">{title}</div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      {right}
      {to && <button className="link-btn" onClick={() => navigate(to)}>{label} <Icon name="arrowRight" size={13} /></button>}
    </div>
  );
}
import { localISO, addDaysISO, appliesOn, fmtClock } from '../../utils/date';

const EMPTY_PLATFORM = { id: '', name: '', color: '#0e76b3', tasks: '' };

const DAILY_THEME = {
  1: { label: 'Outreach day',          sub: 'Reddit + Discord + LinkedIn connections + Behance',      tasks: ['Post [FOR HIRE] on Reddit','Message in Discord server','Send 10 LinkedIn connections','Update Behance case study'] },
  2: { label: 'Content day',           sub: 'LinkedIn post #1 + Instagram + client work',             tasks: ['Publish LinkedIn post #1','Post Instagram Story','Work on active client project','Reply to all DMs & comments'] },
  3: { label: 'Portfolio + Discovery', sub: 'Dribbble + research + Discord',                          tasks: ['Post/comment on Dribbble','Research 3 prospects','Post in Discord community','Review analytics'] },
  4: { label: 'Content + Learning',    sub: 'LinkedIn post #2 + 90 min learning block',               tasks: ['Publish LinkedIn post #2','90 min learning block','Follow up on proposals','Reply to inbound leads & DMs'] },
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
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const PRI_COLOR = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--green)' };

export default function MorningHQ() {
  const {
    getTodayChecks, togglePlatformCheck, computeStreak,
    projects, getProposalsNeedingFollowUp,
    updateClient, contentPosts, getUnpaidInvoices,
    getOverdueInvoices, getThisMonthTotalPKR, revenueSettings,
    platforms, addPlatform, updatePlatform, removePlatform,
  } = useAgencyStore();

  const [showPlatformEdit, setShowPlatformEdit] = useState(false);
  const [editingPlatform,  setEditingPlatform]  = useState(null);
  const [platformForm,     setPlatformForm]     = useState(EMPTY_PLATFORM);

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
  const navigate = useUiStore(s => s.navigate);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const todayStr = localISO(now);
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
  const todayChecks = getTodayChecks();
  const streak = computeStreak();

  // ── Priority signal: first matching rule wins ──
  function getPrioritySignal() {
    // Rule 1 — overdue invoices
    const overdueInv = getOverdueInvoices();
    if (overdueInv.length > 0)
      return { to: 'revenue', text: `You have ${overdueInv.length} overdue invoice${overdueInv.length > 1 ? 's' : ''} — chase payments first.` };

    // Rule 2 — revenue behind
    const monthPKR  = getThisMonthTotalPKR();
    const target    = revenueSettings?.monthlyTarget || 300000;
    const daysLeft  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    if (monthPKR < target * 0.4 && daysLeft > 15)
      return { to: 'revenue', text: `Revenue is behind — post a [For Hire] on Reddit and reach out on LinkedIn today.` };

    // Rule 4 — pipeline follow-ups
    const pipeFU = getProposalsNeedingFollowUp();
    if (pipeFU.length >= 2) {
      const days = pipeFU[0].days_waiting;
      return { to: 'pipeline', text: `Contact ${pipeFU[0].name} and ${pipeFU[1].name} — proposals sent ${days} days ago.` };
    }

    // Rule 5 — no content today and no content next 7 days
    const next7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() + i); return localISO(d);
    });
    const hasContent = contentPosts.some(p => next7.includes(p.date));
    if (!hasContent)
      return { to: 'content_calendar', text: `Content calendar is empty for the next 7 days — plan 3 posts now.` };

    // Rule 6 — project past deadline
    const overdueProj = (projects || []).find(p => p.deadline && p.deadline < todayStr && p.deliverables?.some(d => !d.done));
    if (overdueProj)
      return { to: 'projects', text: `${overdueProj.client_name} project is past deadline.` };

    // Rule 7 — low streak
    if (streak < 3)
      return { to: 'platform_checklist', text: `Your streak is ${streak} day${streak !== 1 ? 's' : ''} — check all ${platforms.length} platforms today.` };

    // Rule 8 — all clear
    return { to: 'projects', text: `All clear — focus on delivering active projects.` };
  }
  const prioritySignal = getPrioritySignal();
  const donePlatforms = platforms.filter(p => todayChecks[p.id]).length;

  const todayTasks = getTodayTasks().filter(t => t.status !== 'done');
  const todayTasksShown = todayTasks.slice(0, 5);

  const activeProjects = projects
    .filter(p => p.deliverables?.some(d => !d.done))
    .slice(0, 3);

  const clientFollowUps = getProposalsNeedingFollowUp();
  const todayContent    = contentPosts.filter(p => p.date === todayStr);
  const unpaidInvoices  = getUnpaidInvoices();

  const urgentDate = addDaysISO(todayStr, 3);

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
      <button className="signal" onClick={() => navigate(prioritySignal.to)}>
        <span className="signal-icon"><Icon name="flag" size={16} /></span>
        <span className="signal-body">
          <span className="signal-label">Priority now</span>
          <span className="signal-text">{prioritySignal.text}</span>
        </span>
        <Icon name="arrowRight" size={16} className="signal-arrow" />
      </button>

      <TeamSnapshot />

      {/* ── Section 2: Platform chips ── */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <CardHead
          title="Platforms"
          sub={`${donePlatforms}/${platforms.length} done today`}
          to="platform_checklist" label="Checklist"
          right={<button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowPlatformEdit(true)} title="Edit platforms" aria-label="Edit platforms"><Icon name="pencil" size={14} /></button>}
        />
        <div className="morning-hq-platform-chips">
          {platforms.map(p => (
            <button
              key={p.id}
              className={'platform-chip' + (todayChecks[p.id] ? ' done' : '')}
              onClick={() => togglePlatformCheck(p.id)}
              style={{ borderColor: todayChecks[p.id] ? `color-mix(in srgb, ${p.color} 60%, transparent)` : undefined }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
              {p.name}
              {todayChecks[p.id] && <span style={{ color: 'var(--green)', fontSize: 11 }}>✓</span>}
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
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
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
        <CardHead
          title={`Today's focus · ${todayTheme.label}`}
          sub={todayTheme.sub}
          to="daily_tasks" label="Daily tasks"
          right={<span className="agency-badge agency-badge-blue">{themeDone}/{themeTotal}</span>}
        />
        <div style={{ marginBottom: 10 }}>
          {todayTheme.tasks.map((task, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < themeTotal - 1 ? '1px solid var(--surface-2)' : 'none' }}>
              <button
                onClick={() => toggleThemeCheck(i)}
                style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                  border: `1.5px solid ${themeChecks[i] ? 'var(--green)' : 'var(--border-strong)'}`,
                  background: themeChecks[i] ? 'var(--green)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                {themeChecks[i] && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}
              </button>
              <span style={{ fontSize: 13, color: themeChecks[i] ? 'var(--text-3)' : 'var(--text)', textDecoration: themeChecks[i] ? 'line-through' : 'none' }}>
                {task}
              </span>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--surface-2)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: themeDone === themeTotal ? 'var(--green)' : 'var(--accent)', width: `${Math.round((themeDone / themeTotal) * 100)}%`, borderRadius: 99, transition: 'width .3s' }} />
        </div>
      </div>

      {/* ── Sections 3 + 4: Tasks + Projects grid ── */}
      <div className="morning-hq-grid">

        {/* Today's tasks */}
        <div className="agency-card">
          <CardHead title="Today's tasks" to="today" />
          {todayTasksShown.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '4px 0' }}>No tasks due today</div>
          ) : todayTasksShown.map(task => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRI_COLOR[task.priority], flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, lineHeight: 1.3 }}>{task.title}</span>
              <button
                onClick={() => setTaskStatus(task.id, 'done')}
                title="Mark done"
                style={{
                  background: 'none', border: '1.5px solid var(--border-strong)', borderRadius: 5,
                  width: 20, height: 20, cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: 'var(--text-2)', transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-2)'; }}
              >✓</button>
            </div>
          ))}
          {todayTasks.length > 5 && (
            <button className="link-btn" style={{ marginTop: 8 }} onClick={() => navigate('today')}>
              +{todayTasks.length - 5} more <Icon name="arrowRight" size={13} />
            </button>
          )}
        </div>

        {/* Active projects */}
        <div className="agency-card">
          <CardHead title="Active projects" to="projects" />
          {activeProjects.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '4px 0' }}>No active projects</div>
          ) : activeProjects.map(p => {
            const nextDel = p.deliverables?.find(d => !d.uzair_reviewed && !d.done);
            const isUrgent = p.deadline && p.deadline <= urgentDate;
            return (
              <div key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{p.client_name}</span>
                  {isUrgent && (
                    <span className="agency-badge agency-badge-red" style={{ fontSize: 10 }}>Due soon</span>
                  )}
                </div>
                {nextDel && (
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 1 }}>Next: {nextDel.title}</div>
                )}
                {p.deadline && (
                  <div style={{ fontSize: 11, color: isUrgent ? 'var(--red)' : 'var(--text-3)' }}>
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
          <CardHead title={`${clientFollowUps.length} proposal${clientFollowUps.length !== 1 ? 's' : ''} need a follow-up`} to="pipeline" label="Clients" />
          {clientFollowUps.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 13, flex: 1 }}>
                {c.name} — <span style={{ color: 'var(--amber)' }}>{c.days_waiting} days waiting</span>
              </span>
              <button
                className="agency-btn agency-btn-secondary agency-btn-sm"
                onClick={() => updateClient(c.id, { proposal_sent_date: localISO() })}
              >
                Mark followed up
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Section 6: Today's content ── */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <CardHead title="Today's content" to="content_calendar" label="Calendar" />
        {todayContent.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No content planned — add something</div>
        ) : todayContent.map(post => (
          <div key={post.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
            <span className="agency-badge agency-badge-blue" style={{ fontSize: 10 }}>{post.platform}</span>
            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{post.topic}</span>
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
          <CardHead title={`${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length !== 1 ? 's' : ''}`} to="revenue" label="Revenue" />
          {unpaidInvoices.slice(0, 3).map(inv => {
            const overdue = inv.due_date && inv.due_date < todayStr;
            const days = inv.due_date
              ? Math.floor((new Date() - new Date(inv.due_date)) / 86400000)
              : 0;
            return (
              <div key={inv.id} style={{ fontSize: 12, color: 'var(--red)', marginBottom: 2 }}>
                {inv.client_name} · {inv.amount} {inv.currency}
                {overdue && days > 0 ? ` (${days}d overdue)` : ''}
              </div>
            );
          })}
          {unpaidInvoices.length > 3 && (
            <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
              +{unpaidInvoices.length - 3} more in Revenue dashboard
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// Open team work and unread updates, so employee progress is visible from the home screen.
function TeamSnapshot() {
  const employees = useTeamStore(s => s.employees);
  const serverTasks = useTeamStore(s => s.serverTasks);
  const notifications = useTeamStore(s => s.notifications);
  const routines = useTeamStore(s => s.routines);
  const routineChecks = useTeamStore(s => s.routineChecks);
  const attendance = useTeamStore(s => s.attendance);
  const navigate = useUiStore(s => s.navigate);
  if (!employees.length) return null;
  const today = localISO();
  const open = serverTasks.filter(t => t.status !== 'done');
  const unread = notifications.filter(n => !Number(n.is_read));
  const latest = unread[0] || notifications[0];
  return (
    <div className="agency-card team-snapshot">
      <CardHead title="Team" sub={`${open.length} open task${open.length !== 1 ? 's' : ''} across ${employees.length} ${employees.length === 1 ? 'person' : 'people'}`} to="team" label="Open Team" />
      <div className="team-snapshot-row">
        {employees.map((e, i) => {
          const mine = open.filter(t => t.assignee_name === e.name);
          const items = routines.filter(r => r.user_id === e.id && appliesOn(r.days, today));
          const done = routineChecks.filter(c => c.user_id === e.id && c.day === today && items.some(r => r.id === c.routine_id)).length;
          return (
            <span key={e.id} className="team-snapshot-person">
              <span className="avatar-wrap">
                <span className={`avatar avatar-sm avatar-c${i % 6}`}>{e.name.charAt(0).toUpperCase()}</span>
                {attendance.some(a => a.user_id === e.id && a.online) && <span className="online-dot" title="Online now" />}
              </span>
              {e.name} <span className="muted-small">{mine.length} open</span>
              {(() => {
                const first = attendance.filter(a => a.user_id === e.id).sort((a, b) => a.check_in.localeCompare(b.check_in))[0];
                return first
                  ? <span className="muted-small">· in {fmtClock(first.check_in)}</span>
                  : <span className="muted-small">· not in yet</span>;
              })()}
              {items.length > 0 && (
                <button className={'chip chip-sm' + (done === items.length ? ' chip-green' : '')} onClick={() => navigate('team', { view: 'routine', userId: e.id })} title="Daily routine today">
                  <Icon name="repeat" size={11} /> {done}/{items.length}
                </button>
              )}
            </span>
          );
        })}
      </div>
      {latest && (
        <button className={'team-snapshot-latest' + (unread.length ? ' is-unread' : '')} onClick={() => navigate('team', latest.type === 'routine_done' || latest.type === 'routine_missed' ? { view: 'routine', userId: Number(String(latest.task_id).split(':')[1]) } : latest.task_id ? { taskId: latest.task_id, thread: latest.type === 'comment' } : null)}>
          <Icon name="checkCircle" size={14} />
          <span>{latest.message}</span>
          {unread.length > 1 && <span className="badge badge-accent">+{unread.length - 1} more</span>}
        </button>
      )}
    </div>
  );
}

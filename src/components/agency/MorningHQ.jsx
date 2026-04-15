import { useState, useEffect } from 'react';
import { useAgencyStore } from '../../store/agencyStore';
import { useTaskStore } from '../../store/taskStore';

const PLATFORMS = ['fiverr', 'upwork', 'linkedin', 'reddit', 'discord', 'dribbble'];
const PLATFORM_COLORS = {
  fiverr: '#1DBF73', upwork: '#14A800', linkedin: '#0A66C2',
  reddit: '#FF4500', discord: '#5865F2', dribbble: '#EA4C89',
};

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
  } = useAgencyStore();

  const { getTodayTasks, setTaskStatus } = useTaskStore();

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const todayStr = now.toISOString().split('T')[0];
  const todayChecks = getTodayChecks();
  const streak = computeStreak();
  const donePlatforms = PLATFORMS.filter(p => todayChecks[p]).length;

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="morning-hq-greeting">{getGreeting()}, Uzair</div>
          <div className="morning-hq-date">{fmtDate(now)} · {fmtTime(now)}</div>
        </div>
        {streak > 0 && (
          <span className="agency-badge agency-badge-orange" style={{ fontSize: 13, padding: '5px 12px' }}>
            🔥 {streak} day streak
          </span>
        )}
      </div>

      {/* ── Section 2: Platform chips ── */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div className="morning-section-label" style={{ marginBottom: 10 }}>
          Platforms — {donePlatforms}/6 done today
        </div>
        <div className="morning-hq-platform-chips">
          {PLATFORMS.map(p => (
            <button
              key={p}
              className={'platform-chip' + (todayChecks[p] ? ' done' : '')}
              onClick={() => togglePlatformCheck(p)}
              style={{ borderColor: todayChecks[p] ? PLATFORM_COLORS[p] + '99' : undefined }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: PLATFORM_COLORS[p], flexShrink: 0, display: 'inline-block' }} />
              {p.charAt(0).toUpperCase() + p.slice(1)}
              {todayChecks[p] && <span style={{ color: '#16a34a', fontSize: 11 }}>✓</span>}
            </button>
          ))}
        </div>
        {donePlatforms === 6 && (
          <div className="agency-success-banner" style={{ marginTop: 10, marginBottom: 0 }}>
            🎯 All platforms active today!
          </div>
        )}
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

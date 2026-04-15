import { useState, useMemo } from 'react';
import { useAgencyStore } from '../../store/agencyStore';

const PLATFORM_IDS = ['fiverr', 'upwork', 'linkedin', 'reddit', 'discord', 'dribbble'];
const PLATFORM_LABEL = { fiverr:'Fiverr', upwork:'Upwork', linkedin:'LinkedIn', reddit:'Reddit', discord:'Discord', dribbble:'Dribbble' };
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function toISO(d) { return d.toISOString().split('T')[0]; }

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function getWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`;
}

function pkrFmt(n) { return 'PKR ' + Math.round(n).toLocaleString(); }
function daysSince(dateStr) { return dateStr ? Math.floor((new Date() - new Date(dateStr)) / 86400000) : 0; }

export default function WeeklyReview() {
  const store = useAgencyStore();
  const {
    invoices, clients, upworkProposals, teamTasks, projects, contentPosts,
    dailyChecks, revenueEntries, revenueSettings,
    getCurrentWeekKey, saveWeeklyNote, getWeeklyNote,
    toPKR, computeStreak,
  } = store;

  const todayDate   = new Date();
  const todayISO    = toISO(todayDate);
  const currentKey  = getCurrentWeekKey();

  // Week navigation
  const [viewWeekMonday, setViewWeekMonday] = useState(() => toISO(getMonday(todayDate)));
  const viewWeekKey = getWeekKey(new Date(viewWeekMonday));
  const isCurrentWeek = viewWeekKey === currentKey;

  const viewDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => toISO(addDays(new Date(viewWeekMonday), i))),
  [viewWeekMonday]);

  // ── Notes ──
  const [note, setNote] = useState(() => getWeeklyNote(currentKey));

  // ── Section 1: Last 7 days activity (the selected week) ──
  const activeDays = viewDates.filter(d => {
    const checks = dailyChecks[d] || {};
    return PLATFORM_IDS.some(p => checks[p]);
  }).length;

  const missedPerPlatform = PLATFORM_IDS.map(pid => ({
    pid,
    misses: viewDates.filter(d => !(dailyChecks[d] || {})[pid]).length,
  })).sort((a, b) => b.misses - a.misses);

  // ── Section 2: Revenue this month ──
  const thisMonth      = todayISO.slice(0, 7);
  const monthEntries   = (revenueEntries || []).filter(e => e.date?.startsWith(thisMonth));
  const totalPKR       = monthEntries.reduce((s, e) => s + toPKR(Number(e.amount || 0), e.currency), 0);
  const target         = revenueSettings?.monthlyTarget || 300000;
  const pct            = Math.min(100, Math.round((totalPKR / target) * 100));
  const daysInMonth    = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
  const daysRemaining  = daysInMonth - todayDate.getDate();
  const revenueStatus  = pct >= 80 ? 'on_track' : pct >= 40 ? 'behind' : 'needs_push';

  // ── Section 3: Pipeline stats for viewed week ──
  const weekStart = viewDates[0], weekEnd = viewDates[6];
  const newLeads       = (clients || []).filter(c => c.created_at?.slice(0,10) >= weekStart && c.created_at?.slice(0,10) <= weekEnd).length;
  const proposalsSent  = (clients || []).filter(c => c.proposal_sent_date >= weekStart && c.proposal_sent_date <= weekEnd).length;
  const wonThisWeek    = (clients || []).filter(c => c.stage === 'active' && c.updated_at?.slice(0,10) >= weekStart && c.updated_at?.slice(0,10) <= weekEnd).length;
  const retainersThisWeek = (clients || []).filter(c => c.stage === 'retainer' && c.updated_at?.slice(0,10) >= weekStart && c.updated_at?.slice(0,10) <= weekEnd).length;
  const pendingFollowUps  = (clients || []).filter(c => c.stage === 'proposal' && c.proposal_sent_date && daysSince(c.proposal_sent_date) >= 2);

  // ── Section 4: Content last week (by platform) ──
  const CONTENT_PLATFORMS = ['linkedin', 'reddit', 'dribbble'];
  const CONTENT_TARGET = { linkedin: 3, reddit: 2, dribbble: 2 };
  const contentStats = CONTENT_PLATFORMS.map(p => {
    const planned = (contentPosts || []).filter(cp => cp.platform === p && cp.date >= viewDates[0] && cp.date <= viewDates[6]).length;
    const posted  = (contentPosts || []).filter(cp => cp.platform === p && cp.date >= viewDates[0] && cp.date <= viewDates[6] && cp.status === 'posted').length;
    const target  = CONTENT_TARGET[p] || 2;
    return { p, posted, planned, target };
  });

  // ── Section 5: Next week preview ──
  const nextWeekStart = toISO(addDays(new Date(viewWeekMonday), 7));
  const nextWeekEnd   = toISO(addDays(new Date(viewWeekMonday), 13));
  const nextWeekPosts = (contentPosts || []).filter(cp => cp.date >= nextWeekStart && cp.date <= nextWeekEnd);
  const nextWeekDeadlines = (projects || []).filter(p => p.deadline >= nextWeekStart && p.deadline <= nextWeekEnd);
  const upworkFollowUpsDue = (upworkProposals || []).filter(p => p.status === 'applied' && !p.follow_up_sent && daysSince(p.applied_date) >= 5);

  // ── Section 6: Smart suggestion (first matching rule) ──
  const overdueInvoicesList = (invoices || []).filter(i => !i.paid && i.due_date && i.due_date < todayISO);
  const streak = computeStreak();

  const smartAction = useMemo(() => {
    // Rule 1
    if (overdueInvoicesList.length > 0) {
      const total = overdueInvoicesList.reduce((s, i) => s + toPKR(Number(i.amount || 0), i.currency), 0);
      return { color: '#b91c1c', bg: '#fef2f2', text: `You have ${overdueInvoicesList.length} overdue invoice${overdueInvoicesList.length > 1 ? 's' : ''} totalling ${pkrFmt(total)}. Chase payments before anything else.` };
    }
    // Rule 2
    if (pct < 40 && daysRemaining > 15) {
      return { color: '#d97706', bg: '#fffbeb', text: `You're behind on revenue (${pct}% of target). Post a [For Hire] on Reddit and Upwork today.` };
    }
    // Rule 3
    if (upworkFollowUpsDue.length >= 2) {
      const names = upworkFollowUpsDue.slice(0, 2).map(p => `"${p.job_title}"`).join(' and ');
      return { color: '#d97706', bg: '#fffbeb', text: `Follow up on ${names} on Upwork — they've been waiting ${daysSince(upworkFollowUpsDue[0].applied_date)}+ days.` };
    }
    // Rule 4
    const stalePipeline = (clients || []).filter(c => c.stage === 'proposal' && daysSince(c.proposal_sent_date) >= 3);
    if (stalePipeline.length >= 2) {
      const names = stalePipeline.slice(0, 2).map(c => c.name).join(' and ');
      return { color: '#d97706', bg: '#fffbeb', text: `Contact ${names} — proposals sent ${daysSince(stalePipeline[0].proposal_sent_date)}+ days ago, no reply.` };
    }
    // Rule 5
    if (nextWeekPosts.length === 0) {
      return { color: '#0057B8', bg: '#eff6ff', text: `Content calendar is empty next week. Open it and plan 3 posts now.` };
    }
    // Rule 6
    const overdueProject = (projects || []).find(p => p.deadline && p.deadline < todayISO && p.deliverables?.some(d => !d.done));
    if (overdueProject) {
      return { color: '#b91c1c', bg: '#fef2f2', text: `${overdueProject.client_name}'s ${overdueProject.service?.replace(/_/g,' ')} project is past deadline. Check project tracker.` };
    }
    // Rule 7
    if (streak < 3) {
      return { color: '#d97706', bg: '#fffbeb', text: `Your streak is only ${streak} day${streak !== 1 ? 's' : ''}. Start fresh tomorrow — check all 6 platforms.` };
    }
    // Rule 8
    return { color: '#16a34a', bg: '#f0fdf4', text: `Strong week. Focus on landing one new retainer client this week.` };
  }, [overdueInvoicesList.length, pct, daysRemaining, upworkFollowUpsDue.length, nextWeekPosts.length, streak]);

  const ws = new Date(viewWeekMonday);
  const we = addDays(ws, 6);
  const weekLabel = `${ws.getDate()} ${MONTH_NAMES[ws.getMonth()]} – ${we.getDate()} ${MONTH_NAMES[we.getMonth()]} ${we.getFullYear()}`;

  return (
    <div className="agency-page">

      {/* Header */}
      <div className="agency-page-header">
        <div className="agency-page-title">Weekly Review</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => setViewWeekMonday(toISO(addDays(new Date(viewWeekMonday), -7)))}>‹</button>
          <span style={{ fontSize: 13, color: '#475569', minWidth: 160, textAlign: 'center' }}>{weekLabel}</span>
          <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => setViewWeekMonday(toISO(addDays(new Date(viewWeekMonday), 7)))}>›</button>
          {!isCurrentWeek && (
            <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => setViewWeekMonday(toISO(getMonday(todayDate)))}>This week</button>
          )}
        </div>
      </div>

      {/* Section 1 — Platform Activity */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div className="morning-section-label" style={{ marginBottom: 10 }}>Platform Activity</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {viewDates.map((d, i) => {
            const checks = dailyChecks[d] || {};
            const count  = PLATFORM_IDS.filter(p => checks[p]).length;
            const isToday = d === todayISO;
            const bg = count === 6 ? '#22c55e' : count >= 3 ? '#86efac' : count > 0 ? '#fcd34d' : '#f1f5f9';
            return (
              <div key={d} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{DAY_NAMES[i]}</div>
                <div style={{
                  height: 32, borderRadius: 5, background: bg,
                  outline: isToday ? '2px solid #0057B8' : 'none', outlineOffset: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: count > 0 ? '#166534' : '#cbd5e1',
                }}>
                  {count > 0 ? count : '—'}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
          Active <strong>{activeDays}/7 days</strong>
          {activeDays === 7 && <span style={{ color: '#16a34a', marginLeft: 8 }}>🔥 Perfect week!</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {missedPerPlatform.filter(x => x.misses > 0).slice(0, 4).map(({ pid, misses }) => (
            <span key={pid} style={{ fontSize: 11, color: misses >= 5 ? '#b91c1c' : '#64748b' }}>
              {PLATFORM_LABEL[pid]}: missed {misses}d
            </span>
          ))}
          {missedPerPlatform.every(x => x.misses === 0) && (
            <span style={{ fontSize: 11, color: '#16a34a' }}>✓ All platforms covered every day</span>
          )}
        </div>
      </div>

      {/* Section 2 — Revenue */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div className="morning-section-label" style={{ marginBottom: 10 }}>Revenue This Month</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{pkrFmt(totalPKR)}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>of {pkrFmt(target)} target</div>
          </div>
          <div>
            <div style={{
              fontSize: 20, fontWeight: 700,
              color: revenueStatus === 'on_track' ? '#16a34a' : revenueStatus === 'behind' ? '#d97706' : '#b91c1c',
            }}>{pct}%</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{daysRemaining}d remaining</div>
          </div>
          <div style={{ alignSelf: 'center' }}>
            <span className={`agency-badge ${revenueStatus === 'on_track' ? 'agency-badge-green' : revenueStatus === 'behind' ? 'agency-badge-orange' : 'agency-badge-red'}`}>
              {revenueStatus === 'on_track' ? '✓ On track' : revenueStatus === 'behind' ? '⚠ Behind' : '🔴 Needs push'}
            </span>
          </div>
        </div>
        <div className="agency-progress-wrap" style={{ height: 8 }}>
          <div className={'agency-progress-fill' + (pct >= 100 ? ' complete' : '')} style={{ width: pct + '%' }} />
        </div>
      </div>

      {/* Section 3 — Pipeline */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div className="morning-section-label" style={{ marginBottom: 10 }}>Pipeline This Week</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: pendingFollowUps.length > 0 ? 10 : 0 }}>
          {[
            { label: 'New leads',      value: newLeads },
            { label: 'Proposals sent', value: proposalsSent },
            { label: 'Won',            value: wonThisWeek,       color: wonThisWeek > 0 ? '#16a34a' : undefined },
            { label: 'Retainers',      value: retainersThisWeek, color: retainersThisWeek > 0 ? '#16a34a' : undefined },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color || '#1e293b' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.label}</div>
            </div>
          ))}
        </div>
        {pendingFollowUps.length > 0 && (
          <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', padding: '6px 10px', borderRadius: 6 }}>
            ⚠ {pendingFollowUps.length} follow-up{pendingFollowUps.length > 1 ? 's' : ''} pending:{' '}
            {pendingFollowUps.map(c => c.name).join(', ')}
          </div>
        )}
      </div>

      {/* Section 4 — Content */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div className="morning-section-label" style={{ marginBottom: 10 }}>Content Last Week</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {contentStats.map(({ p, posted, planned, target }) => {
            const icon = posted >= target ? '✓' : posted > 0 ? '⚠' : '✗';
            const color = posted >= target ? '#16a34a' : posted > 0 ? '#d97706' : '#b91c1c';
            return (
              <div key={p} style={{ fontSize: 13, color, fontWeight: 500 }}>
                {p.charAt(0).toUpperCase() + p.slice(1)} {posted}/{target} {icon}
              </div>
            );
          })}
          {contentStats.every(s => s.planned === 0) && (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>No posts logged for this week</div>
          )}
        </div>
      </div>

      {/* Section 5 — Next week preview */}
      <div className="agency-card" style={{ marginBottom: 14 }}>
        <div className="morning-section-label" style={{ marginBottom: 10 }}>Next Week Preview</div>

        {/* Content */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>📅 Content planned</div>
          {nextWeekPosts.length === 0 ? (
            <div style={{ fontSize: 12, color: '#ef4444' }}>⚠ Nothing planned — open Content Calendar and add posts</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {nextWeekPosts.map(cp => (
                <span key={cp.id} style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 8px', borderRadius: 99, color: '#475569' }}>
                  {cp.date.slice(5)} · {cp.platform} · {cp.topic?.slice(0,30) || 'no topic'}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Deadlines */}
        {nextWeekDeadlines.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>⚡ Project deadlines</div>
            {nextWeekDeadlines.map(p => (
              <div key={p.id} style={{ fontSize: 12, color: '#b91c1c', marginBottom: 2 }}>
                {p.client_name} — {p.service?.replace(/_/g,' ')} · due {p.deadline}
              </div>
            ))}
          </div>
        )}

        {/* Upwork follow-ups */}
        {upworkFollowUpsDue.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>📨 Upwork follow-ups due</div>
            {upworkFollowUpsDue.slice(0, 3).map(p => (
              <div key={p.id} style={{ fontSize: 12, color: '#d97706', marginBottom: 2 }}>
                {p.job_title} · {daysSince(p.applied_date)}d waiting
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 6 — Smart action + Focus note */}
      <div className="agency-card" style={{ marginBottom: 14, background: smartAction.bg, border: `1px solid ${smartAction.color}22` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: smartAction.color, marginBottom: 6 }}>💡 Smart action</div>
        <div style={{ fontSize: 14, color: smartAction.color, fontWeight: 500 }}>{smartAction.text}</div>
      </div>

      <div className="agency-card">
        <div className="morning-section-label" style={{ marginBottom: 8 }}>Focus for this week</div>
        <textarea
          style={{
            width: '100%', minHeight: 80, fontSize: 13, border: '1px solid #e2e8f0',
            borderRadius: 7, padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit',
            color: '#334155', boxSizing: 'border-box', lineHeight: 1.5,
          }}
          placeholder="What's the #1 thing you want to accomplish this week?"
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={() => saveWeeklyNote(viewWeekKey, note)}
        />
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Auto-saves on blur</div>
      </div>

    </div>
  );
}

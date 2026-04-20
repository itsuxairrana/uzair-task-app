import { useState } from 'react';
import { useAgencyStore } from '../../store/agencyStore';

function getLastNDays(n) {
  const days = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(d);
    dd.setDate(d.getDate() - i);
    days.push(dd.toISOString().split('T')[0]);
  }
  return days;
}

function fmtDateShort(str) {
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PlatformChecklist() {
  const { getTodayChecks, getDayChecks, togglePlatformCheck, computeStreak, platforms } = useAgencyStore();
  const [tooltip, setTooltip] = useState(null);

  const todayChecks  = getTodayChecks();
  const streak       = computeStreak();
  const total        = platforms.length || 1;
  const doneCount    = platforms.filter(p => todayChecks[p.id]).length;
  const allDone      = doneCount === platforms.length && platforms.length > 0;
  const pct          = Math.round((doneCount / total) * 100);
  const today        = new Date().toISOString().split('T')[0];
  const last30       = getLastNDays(30);

  return (
    <div className="agency-page">

      {/* Header */}
      <div className="agency-page-header">
        <div>
          <div className="agency-page-title">Platform Checklist</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
        {streak > 0 && (
          <span className="agency-badge agency-badge-orange" style={{ fontSize: 13, padding: '6px 14px' }}>
            🔥 {streak} day streak
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{doneCount}/{platforms.length} platforms active today</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>{pct}%</span>
        </div>
        <div className="agency-progress-wrap" style={{ height: 10 }}>
          <div
            className={'agency-progress-fill' + (allDone ? ' complete' : '')}
            style={{ width: pct + '%' }}
          />
        </div>
      </div>

      {/* Success banner */}
      {allDone && (
        <div className="agency-success-banner" style={{ marginBottom: 20 }}>
          🎯 All platforms active today — great work!
        </div>
      )}

      {/* Platform cards */}
      <div className="agency-platform-grid">
        {platforms.map(p => {
          const checked = !!todayChecks[p.id];
          return (
            <div
              key={p.id}
              className={'agency-platform-card' + (checked ? ' checked' : '')}
              style={{ borderLeftColor: p.color }}
              onClick={() => togglePlatformCheck(p.id)}
            >
              {/* Checkbox */}
              <div className={'agency-platform-checkbox' + (checked ? ' checked' : '')}>
                {checked && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>

              {/* Platform name */}
              <div className="agency-platform-name" style={{ color: checked ? p.color : '#1e293b', paddingRight: 28 }}>
                {p.name}
              </div>

              {/* Task list */}
              <div className="agency-platform-tasks">
                {(p.tasks || '').split(' · ').map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 2 }}>
                    <span style={{ color: p.color, flexShrink: 0, marginTop: 1 }}>›</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Heatmap — last 30 days */}
      <div className="agency-card">
        <div className="morning-section-label" style={{ marginBottom: 10 }}>Activity — last 30 days</div>
        <div className="agency-heatmap" style={{ position: 'relative' }}>
          {last30.map(dateStr => {
            const checks = getDayChecks(dateStr);
            const count  = platforms.filter(p => checks[p.id]).length;
            const cls    = count === platforms.length && platforms.length > 0 ? 'agency-heatmap-full' : count > 0 ? 'agency-heatmap-partial' : 'agency-heatmap-none';
            const isToday = dateStr === today;
            return (
              <div
                key={dateStr}
                className={'agency-heatmap-day ' + cls}
                style={{
                  outline: isToday ? '2px solid #0057B8' : 'none',
                  outlineOffset: 1,
                  cursor: 'default',
                  position: 'relative',
                }}
                title={`${fmtDateShort(dateStr)} — ${count}/6 platforms`}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
          <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'#22c55e', marginRight:4, verticalAlign:'middle' }} />All {platforms.length}</span>
          <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'#FCD34D', marginRight:4, verticalAlign:'middle' }} />Partial</span>
          <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'#f1f5f9', marginRight:4, verticalAlign:'middle' }} />None</span>
        </div>
      </div>

    </div>
  );
}

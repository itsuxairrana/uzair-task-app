import { useCallback, useEffect, useState } from 'react';
import { useTeamStore } from '../../store/teamStore';
import { fetchAttendance } from '../../services/collabApi';
import { localISO, addDaysISO, parseISO, fmtClock, fmtDuration } from '../../utils/date';
import Icon from '../Icon';

const parseTs = ts => Date.parse(String(ts));

// Duration of one session: check-in → check-out (or last activity), or → now while online.
function sessionMs(s, now) {
  const end = s.online ? now : parseTs(s.effective_out || s.last_seen);
  return Math.max(0, end - parseTs(s.check_in));
}

function dayLabel(iso) {
  const today = localISO();
  if (iso === today) return 'Today';
  if (iso === addDaysISO(today, -1)) return 'Yesterday';
  return parseISO(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// Admin view: who checked in when, for how long, and the last 7 days at a glance.
export default function AttendanceBoard() {
  const employees = useTeamStore(s => s.employees);
  const today = localISO();
  const [day, setDay] = useState(today);
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({}); // employee id → sessions list expanded
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => (
    fetchAttendance(addDaysISO(day, -6), day).then(
      rows => { setSessions(rows); setError(''); setNow(Date.now()); },
      e => setError(e.message),
    )
  ), [day]);

  useEffect(() => {
    load();
    if (day !== today) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(t);
  }, [load, day, today]);

  const week = Array.from({ length: 7 }, (_, k) => addDaysISO(day, k - 6));
  const forUserDay = (uid, d) => (sessions || []).filter(s => s.user_id === uid && s.day === d)
    .sort((a, b) => parseTs(a.check_in) - parseTs(b.check_in));

  return (
    <div className="attendance">
      <div className="attendance-head">
        <div className="date-nav">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDay(d => addDaysISO(d, -1))} aria-label="Previous day"><Icon name="chevronLeft" size={16} /></button>
          <span className="date-nav-label">{dayLabel(day)}</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDay(d => addDaysISO(d, 1))} disabled={day >= today} aria-label="Next day"><Icon name="chevronRight" size={16} /></button>
          {day !== today && <button className="btn btn-secondary btn-sm" onClick={() => setDay(today)}>Today</button>}
        </div>
        <p className="muted-small">Check-in is recorded when an employee signs in or opens the app; check-out when they sign out, or automatically at their last activity if they just close it.</p>
      </div>

      {error && <div className="callout callout-red">{error}</div>}
      {sessions === null && !error && <div className="skeleton-list"><div className="skeleton" /><div className="skeleton" /></div>}

      {sessions && (
        <>
          <div className="list-card">
            {employees.map((e, i) => {
              const list = forUserDay(e.id, day);
              const online = list.some(s => s.online);
              const total = list.reduce((sum, s) => sum + sessionMs(s, now), 0);
              const first = list[0];
              const last = list[list.length - 1];
              return (
                <div key={e.id} className="list-row attendance-row">
                  <span className={`avatar avatar-c${i % 6}`}>{e.name.charAt(0).toUpperCase()}</span>
                  <div className="list-row-main">
                    <div className="list-row-title">
                      {e.name}{' '}
                      {online ? <span className="presence presence-on">Online now</span>
                        : list.length ? <span className="presence">Signed out</span>
                        : <span className="presence presence-off">{day === today ? 'Not checked in yet' : 'Absent'}</span>}
                    </div>
                    {list.length > 0 && (
                      <div className="list-row-meta">
                        <span><Icon name="arrowRight" size={12} /> In {fmtClock(first.check_in)}</span>
                        <span>Out {online ? '—' : fmtClock(last.effective_out)}{!online && last.checkout_kind === 'auto' ? ' (closed app)' : ''}</span>
                        <span><Icon name="clock" size={12} /> {fmtDuration(total)}</span>
                        {list.length > 1 && (
                          <button className="link-btn" onClick={() => setOpen(o => ({ ...o, [e.id]: !o[e.id] }))}>
                            {list.length} sessions <Icon name="chevronDown" size={12} className={open[e.id] ? 'rot-180' : ''} />
                          </button>
                        )}
                      </div>
                    )}
                    {open[e.id] && list.length > 1 && (
                      <ul className="session-list">
                        {list.map(s => (
                          <li key={s.id}>
                            {fmtClock(s.check_in)} – {s.online ? 'now' : fmtClock(s.effective_out)}
                            <span className="muted-small"> · {fmtDuration(sessionMs(s, now))}{!s.online && s.checkout_kind === 'auto' ? ' · closed app' : !s.online ? ' · signed out' : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {list.length > 0 && <span className="attendance-total">{fmtDuration(total)}</span>}
                </div>
              );
            })}
          </div>

          <div className="card-head"><div><div className="card-title">Last 7 days</div><div className="card-sub">Time in the app per day — click a day to see details.</div></div></div>
          <div className="attendance-week">
            <table className="agency-table">
              <thead>
                <tr>
                  <th />
                  {week.map(d => (
                    <th key={d} className={d === day ? 'is-selected' : ''}>
                      <button className="link-btn week-head-btn" onClick={() => setDay(d)}>
                        {parseISO(d).toLocaleDateString('en-US', { weekday: 'short' })} <span className="muted-small">{parseISO(d).getDate()}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id}>
                    <td className="attendance-name">{e.name}</td>
                    {week.map(d => {
                      const list = forUserDay(e.id, d);
                      const total = list.reduce((sum, s) => sum + sessionMs(s, now), 0);
                      return (
                        <td key={d} className={(d === day ? 'is-selected ' : '') + (list.length ? '' : 'muted-small')} onClick={() => setDay(d)}>
                          {list.length ? <><span className="mono">{fmtDuration(total)}</span><div className="muted-small">{fmtClock(list[0].check_in)}</div></> : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

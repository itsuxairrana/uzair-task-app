import { useEffect, useRef, useState } from 'react';
import { useTeamStore } from '../../store/teamStore';
import { addRoutine, updateRoutine, removeRoutine } from '../../services/collabApi';
import { localISO, addDaysISO, parseISO, appliesOn, daysLabel, fmtClock, ALL_DAYS, WEEKDAY_SHORT, WEEK_ORDER } from '../../utils/date';
import Icon from '../Icon';

// Admin view of every employee's daily routine: today's progress, last 7 days, and editing.
// Items can run every day or only on chosen weekdays.
export default function RoutineBoard({ focusUserId }) {
  const employees = useTeamStore(s => s.employees);
  const routines = useTeamStore(s => s.routines);
  const checks = useTeamStore(s => s.routineChecks);
  const loadRoutines = useTeamStore(s => s.loadRoutines);
  const cardRefs = useRef({});
  const [flash, setFlash] = useState(focusUserId);
  const [dayFilter, setDayFilter] = useState('all'); // 'all' | weekday digit as string

  useEffect(() => { loadRoutines(); }, [loadRoutines]);

  useEffect(() => {
    if (!flash) return;
    cardRefs.current[flash]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const t = setTimeout(() => setFlash(null), 3200);
    return () => clearTimeout(t);
  }, [flash]);

  if (!employees.length) return null;
  const todayWd = String(parseISO(localISO()).getDay());

  return (
    <>
      <div className="day-filter" role="tablist" aria-label="Show routine for">
        <button className={'day-filter-opt' + (dayFilter === 'all' ? ' is-active' : '')} onClick={() => setDayFilter('all')}>All days</button>
        {WEEK_ORDER.map(n => (
          <button key={n} className={'day-filter-opt' + (dayFilter === String(n) ? ' is-active' : '') + (String(n) === todayWd ? ' is-today' : '')} onClick={() => setDayFilter(String(n))}>
            {WEEKDAY_SHORT[n]}
          </button>
        ))}
      </div>
      {dayFilter !== 'all' && (
        <p className="muted-small">Showing what runs on {WEEKDAY_SHORT[dayFilter]}. Items you add now are {WEEKDAY_SHORT[dayFilter]}-only — change that with the day picker on each item.</p>
      )}
      <div className="routine-grid">
        {employees.map((e, i) => (
          <RoutineCard
            key={e.id}
            employee={e}
            colorIdx={i}
            items={routines.filter(r => r.user_id === e.id)}
            checks={checks.filter(c => c.user_id === e.id)}
            dayFilter={dayFilter}
            highlighted={flash === e.id}
            cardRef={el => { cardRefs.current[e.id] = el; }}
            onChanged={loadRoutines}
          />
        ))}
      </div>
    </>
  );
}

function DayPicker({ value, onChange, disabled }) {
  const set = new Set(String(value));
  function toggle(n) {
    const next = new Set(set);
    if (next.has(n)) next.delete(n); else next.add(n);
    if (next.size) onChange([...next].sort().join(''));
  }
  return (
    <div className="day-picker">
      {WEEK_ORDER.map(n => {
        const d = String(n);
        return (
          <button key={n} type="button" disabled={disabled} className={'day-pick' + (set.has(d) ? ' is-on' : '')} onClick={() => toggle(d)} aria-pressed={set.has(d)} title={WEEKDAY_SHORT[n]}>
            {WEEKDAY_SHORT[n].charAt(0)}
          </button>
        );
      })}
      <button type="button" className="link-btn day-pick-preset" disabled={disabled} onClick={() => onChange(ALL_DAYS)}>Every day</button>
      <button type="button" className="link-btn day-pick-preset" disabled={disabled} onClick={() => onChange('12345')}>Weekdays</button>
    </div>
  );
}

function RoutineCard({ employee, colorIdx, items, checks, dayFilter, highlighted, cardRef, onChanged }) {
  const today = localISO();
  const [newTitle, setNewTitle] = useState('');
  const [newDays, setNewDays]   = useState(null); // null = follow the day filter
  const [editing, setEditing]   = useState(null); // { id, title }
  const [picking, setPicking]   = useState(null); // routine id whose day picker is open
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  const todays = items.filter(r => appliesOn(r.days, today));
  const doneToday = new Map(checks.filter(c => c.day === today).map(c => [c.routine_id, c.done_at]));
  const doneCount = todays.filter(r => doneToday.has(r.id)).length;
  const days = Array.from({ length: 7 }, (_, k) => addDaysISO(today, k - 6));
  const shown = dayFilter === 'all' ? items : items.filter(r => String(r.days || ALL_DAYS).includes(dayFilter));
  const addDays = newDays ?? (dayFilter === 'all' ? ALL_DAYS : dayFilter);

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); await onChanged(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function add(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    run(async () => { await addRoutine(employee.id, title, '', addDays); setNewTitle(''); setNewDays(null); });
  }

  function saveEdit(e) {
    e?.preventDefault();
    if (!editing?.title.trim()) { setEditing(null); return; }
    const { id, title } = editing;
    run(async () => { await updateRoutine(id, { title: title.trim() }); setEditing(null); });
  }

  return (
    <section ref={cardRef} className={'routine-card' + (highlighted ? ' is-highlight' : '')}>
      <div className="routine-card-head">
        <span className={`avatar avatar-c${colorIdx % 6}`}>{employee.name.charAt(0).toUpperCase()}</span>
        <div className="routine-card-who">
          <div className="card-title">{employee.name}</div>
          <div className="card-sub">
            {items.length === 0 ? 'No daily routine yet'
              : todays.length === 0 ? 'Nothing scheduled today'
              : doneCount === todays.length ? `All ${todays.length} done today`
              : `${doneCount} of ${todays.length} done today`}
          </div>
        </div>
        {todays.length > 0 && (
          <span className={'routine-ring' + (doneCount === todays.length ? ' is-complete' : '')} style={{ '--p': `${Math.round((doneCount / todays.length) * 100)}%` }}>
            {doneCount}/{todays.length}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div className="week-strip" aria-label="Last 7 days">
          {days.map(d => {
            const planned = items.filter(r => appliesOn(r.days, d));
            const n = checks.filter(c => c.day === d && planned.some(r => r.id === c.routine_id)).length;
            const tone = planned.length === 0 ? 'off' : n === 0 ? 'none' : n >= planned.length ? 'full' : 'partial';
            return (
              <div key={d} className={`week-day week-${tone}` + (d === today ? ' is-today' : '')} title={`${parseISO(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${planned.length ? `${n}/${planned.length}` : 'nothing scheduled'}`}>
                <span className="week-bar" />
                <span className="week-label">{parseISO(d).toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
              </div>
            );
          })}
        </div>
      )}

      <ul className="routine-items">
        {shown.length === 0 && items.length > 0 && <li className="empty-inline">Nothing on {WEEKDAY_SHORT[dayFilter]} yet.</li>}
        {shown.map(r => {
          const doneAt = doneToday.get(r.id);
          const isToday = appliesOn(r.days, today);
          return (
            <li key={r.id} className={'routine-item' + (doneAt && isToday ? ' is-done' : '') + (isToday ? '' : ' is-off')}>
              <div className="routine-item-row">
                <span className="check-box">{doneAt && isToday ? <Icon name="check" size={11} strokeWidth={3} /> : null}</span>
                {editing?.id === r.id ? (
                  <form className="routine-edit" onSubmit={saveEdit}>
                    <input className="input input-sm" autoFocus value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} onBlur={saveEdit} onKeyDown={e => e.key === 'Escape' && setEditing(null)} />
                  </form>
                ) : (
                  <button className="routine-item-title" onClick={() => setEditing({ id: r.id, title: r.title })} title="Click to rename">{r.title}</button>
                )}
                {doneAt && isToday && <span className="muted-small">{fmtClock(doneAt)}</span>}
                <button className={'days-chip' + (picking === r.id ? ' is-open' : '')} onClick={() => setPicking(p => (p === r.id ? null : r.id))} title="Which days this runs">
                  <Icon name="calendar" size={11} /> {daysLabel(r.days)}
                </button>
                <button className="btn btn-ghost btn-icon btn-sm btn-danger-text routine-item-del" disabled={busy} onClick={() => { if (confirm(`Remove "${r.title}" from ${employee.name}'s routine?`)) run(() => removeRoutine(r.id)); }} aria-label="Remove item"><Icon name="x" size={13} /></button>
              </div>
              {picking === r.id && (
                <DayPicker value={r.days || ALL_DAYS} disabled={busy} onChange={v => run(() => updateRoutine(r.id, { days: v }))} />
              )}
            </li>
          );
        })}
      </ul>

      <form className="routine-add" onSubmit={add}>
        <div className="routine-add-row">
          <input className="input input-sm" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={items.length ? 'Add another routine item…' : 'e.g. Reply to all DMs'} maxLength={200} />
          <button className="btn btn-secondary btn-sm" disabled={busy || !newTitle.trim()}><Icon name="plus" size={13} /> Add</button>
        </div>
        {newTitle.trim() && (
          <div className="routine-add-days">
            <span className="muted-small">Runs on:</span>
            <DayPicker value={addDays} onChange={setNewDays} disabled={busy} />
          </div>
        )}
      </form>
      {error && <div className="form-msg form-msg-err">{error}</div>}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTeamStore } from '../../store/teamStore';
import { addRoutine, updateRoutine, removeRoutine } from '../../services/collabApi';
import { localISO, addDaysISO, parseISO } from '../../utils/date';
import Icon from '../Icon';

// Admin view of every employee's daily routine: today's progress, last 7 days, and editing.
export default function RoutineBoard({ focusUserId }) {
  const employees = useTeamStore(s => s.employees);
  const routines = useTeamStore(s => s.routines);
  const checks = useTeamStore(s => s.routineChecks);
  const loadRoutines = useTeamStore(s => s.loadRoutines);
  const cardRefs = useRef({});
  const [flash, setFlash] = useState(focusUserId);

  useEffect(() => { loadRoutines(); }, [loadRoutines]);

  useEffect(() => {
    if (!flash) return;
    cardRefs.current[flash]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const t = setTimeout(() => setFlash(null), 3200);
    return () => clearTimeout(t);
  }, [flash]);

  if (!employees.length) return null;

  return (
    <div className="routine-grid">
      {employees.map((e, i) => (
        <RoutineCard
          key={e.id}
          employee={e}
          colorIdx={i}
          items={routines.filter(r => r.user_id === e.id)}
          checks={checks.filter(c => c.user_id === e.id)}
          highlighted={flash === e.id}
          cardRef={el => { cardRefs.current[e.id] = el; }}
          onChanged={loadRoutines}
        />
      ))}
    </div>
  );
}

function RoutineCard({ employee, colorIdx, items, checks, highlighted, cardRef, onChanged }) {
  const today = localISO();
  const [newTitle, setNewTitle] = useState('');
  const [editing, setEditing]   = useState(null); // { id, title }
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  const doneToday = new Map(checks.filter(c => c.day === today).map(c => [c.routine_id, c.done_at]));
  const activeIds = new Set(items.map(r => r.id));
  const doneCount = items.filter(r => doneToday.has(r.id)).length;
  const days = Array.from({ length: 7 }, (_, k) => addDaysISO(today, k - 6));

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); await onChanged(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function add(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    run(async () => { await addRoutine(employee.id, title); setNewTitle(''); });
  }

  function saveEdit(e) {
    e?.preventDefault();
    if (!editing?.title.trim()) { setEditing(null); return; }
    const { id, title } = editing;
    run(async () => { await updateRoutine(id, title.trim()); setEditing(null); });
  }

  return (
    <section ref={cardRef} className={'routine-card' + (highlighted ? ' is-highlight' : '')}>
      <div className="routine-card-head">
        <span className={`avatar avatar-c${colorIdx % 6}`}>{employee.name.charAt(0).toUpperCase()}</span>
        <div className="routine-card-who">
          <div className="card-title">{employee.name}</div>
          <div className="card-sub">
            {items.length === 0 ? 'No daily routine yet' : doneCount === items.length ? `All ${items.length} done today` : `${doneCount} of ${items.length} done today`}
          </div>
        </div>
        {items.length > 0 && (
          <span className={'routine-ring' + (doneCount === items.length ? ' is-complete' : '')} style={{ '--p': `${Math.round((doneCount / items.length) * 100)}%` }}>
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div className="week-strip" aria-label="Last 7 days">
          {days.map(d => {
            const n = checks.filter(c => c.day === d && activeIds.has(c.routine_id)).length;
            const tone = n === 0 ? 'none' : n >= items.length ? 'full' : 'partial';
            return (
              <div key={d} className={`week-day week-${tone}` + (d === today ? ' is-today' : '')} title={`${parseISO(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${n}/${items.length}`}>
                <span className="week-bar" />
                <span className="week-label">{parseISO(d).toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
              </div>
            );
          })}
        </div>
      )}

      <ul className="routine-items">
        {items.map(r => {
          const doneAt = doneToday.get(r.id);
          return (
            <li key={r.id} className={'routine-item' + (doneAt ? ' is-done' : '')}>
              <span className="check-box">{doneAt ? <Icon name="check" size={11} strokeWidth={3} /> : null}</span>
              {editing?.id === r.id ? (
                <form className="routine-edit" onSubmit={saveEdit}>
                  <input className="input input-sm" autoFocus value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} onBlur={saveEdit} onKeyDown={e => e.key === 'Escape' && setEditing(null)} />
                </form>
              ) : (
                <button className="routine-item-title" onClick={() => setEditing({ id: r.id, title: r.title })} title="Click to rename">{r.title}</button>
              )}
              {doneAt && <span className="muted-small">{new Date(doneAt.replace(' ', 'T') + 'Z').toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
              <button className="btn btn-ghost btn-icon btn-sm btn-danger-text routine-item-del" disabled={busy} onClick={() => { if (confirm(`Remove "${r.title}" from ${employee.name}'s routine?`)) run(() => removeRoutine(r.id)); }} aria-label="Remove item"><Icon name="x" size={13} /></button>
            </li>
          );
        })}
      </ul>

      <form className="routine-add" onSubmit={add}>
        <input className="input input-sm" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={items.length ? 'Add another daily item…' : 'e.g. Reply to all DMs'} maxLength={200} />
        <button className="btn btn-secondary btn-sm" disabled={busy || !newTitle.trim()}><Icon name="plus" size={13} /> Add</button>
      </form>
      {error && <div className="form-msg form-msg-err">{error}</div>}
    </section>
  );
}

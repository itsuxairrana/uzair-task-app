// 12-hour time picker (hour · minute · AM/PM). The browser's <input type="time"> follows the
// OS locale and often shows 24-hour, so we render our own. Value in/out is 24-hour "HH:MM" or ''.
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function split(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(value || '');
  if (!m) return { h: '', min: '00', ap: 'AM' };
  const h24 = Number(m[1]);
  return { h: String(h24 % 12 || 12), min: m[2], ap: h24 < 12 ? 'AM' : 'PM' };
}

function join(h, min, ap) {
  if (!h) return '';
  const h12 = Number(h) % 12;
  return `${String(ap === 'PM' ? h12 + 12 : h12).padStart(2, '0')}:${min}`;
}

export default function TimeInput({ value, onChange, size = '', className = '' }) {
  const { h, min, ap } = split(value);
  const cls = `select${size ? ` select-${size}` : ''}`;
  // Keep an unusual stored minute (e.g. :07 from AI parsing) selectable.
  const minutes = MINUTES.includes(min) ? MINUTES : [...MINUTES, min].sort();
  return (
    <div className={'time-input ' + className}>
      <select className={cls} value={h} onChange={e => onChange(join(e.target.value, min, ap))} aria-label="Hour">
        <option value="">--</option>
        {HOURS.map(n => <option key={n} value={String(n)}>{n}</option>)}
      </select>
      <select className={cls} value={min} onChange={e => onChange(join(h || '9', e.target.value, ap))} aria-label="Minute">
        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className={cls} value={ap} onChange={e => onChange(join(h || '9', min, e.target.value))} aria-label="AM or PM">
        <option>AM</option>
        <option>PM</option>
      </select>
    </div>
  );
}

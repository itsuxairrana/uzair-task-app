import Icon from './Icon';
import Linkify from './Linkify';

// A tickable checklist row. Not a <button>: its text may contain links, and links can't live inside buttons.
export default function CheckItem({ done, next, index, title, hint, onToggle }) {
  return (
    <div
      role="checkbox" aria-checked={!!done} tabIndex={0}
      className={'check-item' + (done ? ' is-done' : '') + (next ? ' is-next' : '')}
      onClick={onToggle}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(); } }}
    >
      <span className="check-box">{done ? <Icon name="check" size={11} strokeWidth={3} /> : index ?? null}</span>
      <span className="check-text">
        <span className="check-title"><Linkify text={title} /></span>
        {hint && <span className="check-hint"><Linkify text={hint} /></span>}
      </span>
    </div>
  );
}

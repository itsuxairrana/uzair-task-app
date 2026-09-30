import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchComments, postComment, deleteComment } from '../services/collabApi';
import { timeAgo, fmtShortDate } from '../utils/date';
import Icon from './Icon';
import Linkify from './Linkify';

const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

// Side drawer with the conversation on one task. Used by the admin (Team page, task cards)
// and by employees (their dashboard). `me` is the signed-in user ({ id, name, role }).
export default function TaskThread({ task, me, onClose, onSeen, onPosted }) {
  const [comments, setComments] = useState(null);
  const [error, setError]       = useState('');
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const taskId = task.id;

  const load = useCallback(async () => {
    try {
      setComments(await fetchComments(taskId));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [taskId]);

  useEffect(() => {
    load();
    onSeen?.(taskId);
    inputRef.current?.focus();
    // Keep the conversation live while it's open.
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 8000);
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { clearInterval(t); document.removeEventListener('keydown', onKey); };
  }, [taskId, load, onClose, onSeen]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [comments?.length]);

  async function send(e) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await postComment(taskId, body);
      setDraft('');
      await load();
      onPosted?.(taskId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function remove(c) {
    if (!confirm('Delete this message?')) return;
    try { await deleteComment(c.id); await load(); onPosted?.(taskId); } catch (err) { setError(err.message); }
  }

  const assignee = task.assignee_name || task.assigned_to;

  return (
    <>
      <div className="scrim scrim-drawer" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Conversation: ${task.title}`}>
        <div className="drawer-head">
          <div className="drawer-head-main">
            <div className="drawer-kicker"><Icon name="message" size={13} /> Conversation</div>
            <div className="drawer-title">{task.title}</div>
            <div className="list-row-meta">
              {task.status && <span className={`pill pill-${task.status}`}>{STATUS_LABEL[task.status] || task.status}</span>}
              {assignee && me.role === 'admin' && <span><Icon name="user" size={12} /> {assignee}</span>}
              {task.due_date && <span><Icon name="calendar" size={12} /> Due {fmtShortDate(task.due_date)}</span>}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <div className="thread" ref={listRef}>
          {comments === null && !error && <div className="thread-empty">Loading…</div>}
          {comments?.length === 0 && (
            <div className="thread-empty">
              <Icon name="message" size={22} />
              <span>No messages yet</span>
              <span className="muted-small">
                {me.role === 'admin' ? `Ask ${assignee || 'your employee'} a question or leave instructions — they'll be notified.` : 'Ask a question or post an update — Uzair will be notified.'}
              </span>
            </div>
          )}
          {comments?.map((c, i) => {
            const mine = c.user_id === me.id;
            const prev = comments[i - 1];
            const grouped = prev && prev.user_id === c.user_id;
            return (
              <div key={c.id} className={'msg' + (mine ? ' is-mine' : '') + (grouped && c.kind !== 'submission' ? ' is-grouped' : '') + (c.kind === 'submission' ? ' is-submission' : '')}>
                {(!grouped || c.kind === 'submission') && (
                  <div className="msg-head">
                    <span className="msg-author">{mine ? 'You' : (c.user_name || 'Former member')}</span>
                    <span className="msg-time">{timeAgo(c.created_at)}</span>
                  </div>
                )}
                <div className="msg-bubble">
                  {c.kind === 'submission' && <div className="msg-submission-head"><Icon name="checkCircle" size={14} /> Work handed in</div>}
                  <Linkify text={c.body} />
                  {mine && <button className="msg-delete" onClick={() => remove(c)} aria-label="Delete message" title="Delete"><Icon name="trash" size={12} /></button>}
                </div>
              </div>
            );
          })}
          {error && <div className="callout callout-red">{error}</div>}
        </div>

        <form className="thread-composer" onSubmit={send}>
          <textarea
            ref={inputRef}
            className="textarea thread-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
            placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
            rows={2}
            maxLength={4000}
          />
          <button className="btn btn-primary btn-icon" disabled={!draft.trim() || sending} aria-label="Send" title="Send">
            <Icon name="send" size={16} />
          </button>
        </form>
      </aside>
    </>
  );
}

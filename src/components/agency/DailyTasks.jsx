import { useState, useRef, useEffect } from 'react';
import { getStoredKey } from '../../services/aiRouter';

const DAILY_THEME = {
  1: { label: 'Outreach day',          sub: 'Reddit + Discord + LinkedIn connections + Behance',  tasks: [{ label: 'Post [FOR HIRE] on Reddit', badge: 'reddit' }, { label: 'Send helpful message in Discord', badge: 'discord' }, { label: 'Send 10 LinkedIn connections', badge: 'linkedin' }, { label: 'Update Behance case study', badge: 'behance' }] },
  2: { label: 'Content day',           sub: 'LinkedIn post #1 + Instagram + client work',        tasks: [{ label: 'Publish LinkedIn post #1', badge: 'linkedin' }, { label: 'Post Instagram Story', badge: 'instagram' }, { label: 'Work on active client project', badge: 'client' }, { label: 'Reply to all DMs & comments', badge: 'social' }] },
  3: { label: 'Portfolio + Discovery', sub: 'Dribbble + research + Discord',                     tasks: [{ label: 'Post/comment on Dribbble', badge: 'dribbble' }, { label: 'Research 3 new prospects', badge: 'outreach' }, { label: 'Post in Discord community', badge: 'discord' }, { label: 'Review analytics', badge: 'review' }] },
  4: { label: 'Content + Learning',    sub: 'LinkedIn post #2 + 90 min learning block',          tasks: [{ label: 'Publish LinkedIn post #2', badge: 'linkedin' }, { label: '90 min learning block', badge: 'learning' }, { label: 'Follow up on open proposals', badge: 'clients' }, { label: 'Check Upwork messages', badge: 'upwork' }] },
  5: { label: 'Publishing day',        sub: 'LinkedIn post #3 + Blog post + Pinterest',          tasks: [{ label: 'Publish LinkedIn post #3', badge: 'linkedin' }, { label: 'Publish blog post', badge: 'blog' }, { label: 'Post 3 Pinterest pins', badge: 'pinterest' }, { label: 'Weekly invoice check', badge: 'finance' }] },
  6: { label: 'Deep work',             sub: 'Client delivery only, no social',                   tasks: [{ label: 'Deliver active client work', badge: 'client' }, { label: 'No social media today', badge: 'focus' }, { label: 'Review project feedback', badge: 'review' }, { label: "Plan next week's content", badge: 'plan' }] },
  0: { label: 'Planning day',          sub: 'Cowork workers + Weekly Review + load calendar',    tasks: [{ label: 'Brief Cowork workers', badge: 'team' }, { label: 'Complete Weekly Review', badge: 'review' }, { label: 'Load content calendar', badge: 'content' }, { label: 'Set top 3 goals for Monday', badge: 'plan' }] },
};

const BADGE_COLOR = {
  reddit:'#FF4500', discord:'#5865F2', linkedin:'#0A66C2', behance:'#1769FF',
  instagram:'#E1306C', client:'#16a34a', social:'#64748b', dribbble:'#EA4C89',
  outreach:'#f97316', review:'#7c3aed', learning:'#0891b2', clients:'#14b8a6',
  upwork:'#14A800', blog:'#8b5cf6', pinterest:'#E60023', finance:'#d97706',
  focus:'#475569', plan:'#0057B8', team:'#f97316', content:'#0A66C2',
};

const THEME_KEY_PREFIX = 'uzair_daily_theme_checks_';
const CUSTOM_TASKS_KEY = 'uzair_custom_daily_tasks';

const SYSTEM_PROMPT = `You are a productivity assistant for Uzair, founder of Uzair Visuals. Help him complete his daily tasks efficiently. Be concise and actionable. Context: He runs a brand identity + website + GEO agency targeting Western startup founders.`;

function loadCustomTasks() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TASKS_KEY)) || []; } catch { return []; }
}

export default function DailyTasks() {
  const today = new Date();
  const todayISO = today.toISOString().split('T')[0];
  const todayDOW = today.getDay();
  const theme = DAILY_THEME[todayDOW];
  const themeKey = THEME_KEY_PREFIX + todayISO;

  const [themeChecks, setThemeChecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(themeKey)) || {}; } catch { return {}; }
  });

  function toggleCheck(idx) {
    const updated = { ...themeChecks, [idx]: !themeChecks[idx] };
    setThemeChecks(updated);
    localStorage.setItem(themeKey, JSON.stringify(updated));
  }

  function resetChecks() {
    setThemeChecks({});
    localStorage.removeItem(themeKey);
  }

  const themeDone = theme.tasks.filter((_, i) => themeChecks[i]).length;

  // ── Custom tasks ──
  const [customTasks, setCustomTasks] = useState(loadCustomTasks);
  const [newTitle, setNewTitle] = useState('');
  const [newNote, setNewNote] = useState('');

  function addCustomTask(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const updated = [...customTasks, { id: Date.now(), title: newTitle.trim(), note: newNote.trim() }];
    setCustomTasks(updated);
    localStorage.setItem(CUSTOM_TASKS_KEY, JSON.stringify(updated));
    setNewTitle('');
    setNewNote('');
  }

  function deleteCustomTask(id) {
    const updated = customTasks.filter(t => t.id !== id);
    setCustomTasks(updated);
    localStorage.setItem(CUSTOM_TASKS_KEY, JSON.stringify(updated));
  }

  // ── AI chat ──
  const claudeKey = getStoredKey('claude');
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendChat(e) {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user', content: chatInput.trim() };
    const newMsgs = [...messages, userMsg].slice(-11);
    setMessages(newMsgs);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: newMsgs,
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || 'No response.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }].slice(-12));
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error — check your Claude API key.' }].slice(-12));
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="agency-page">

      {/* Header */}
      <div className="agency-page-header">
        <div>
          <div className="agency-page-title">Daily Tasks</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{theme.label} — {theme.sub}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="agency-badge agency-badge-blue">{themeDone}/{theme.tasks.length} done</span>
          <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={resetChecks}>Reset</button>
        </div>
      </div>

      {/* Section 1 — Today's themed tasks */}
      <div className="agency-card" style={{ marginBottom: 16 }}>
        <div className="morning-section-label" style={{ marginBottom: 10 }}>Today's schedule</div>

        <div style={{ marginBottom: 12 }}>
          {theme.tasks.map((task, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < theme.tasks.length - 1 ? '1px solid #f8fafc' : 'none' }}>
              <button
                onClick={() => toggleCheck(i)}
                style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                  border: `1.5px solid ${themeChecks[i] ? '#22c55e' : '#cbd5e1'}`,
                  background: themeChecks[i] ? '#22c55e' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                {themeChecks[i] && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
              </button>
              <span style={{ flex: 1, fontSize: 13, color: themeChecks[i] ? '#94a3b8' : '#334155', textDecoration: themeChecks[i] ? 'line-through' : 'none' }}>
                {task.label}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                background: (BADGE_COLOR[task.badge] || '#94a3b8') + '18',
                color: BADGE_COLOR[task.badge] || '#94a3b8',
              }}>
                {task.badge}
              </span>
            </div>
          ))}
        </div>

        <div style={{ background: '#f1f5f9', borderRadius: 99, height: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: themeDone === theme.tasks.length ? '#22c55e' : '#0057B8', width: `${Math.round((themeDone / theme.tasks.length) * 100)}%`, borderRadius: 99, transition: 'width .3s' }} />
        </div>
      </div>

      {/* Section 2 — Custom recurring tasks */}
      <div className="agency-card" style={{ marginBottom: 16 }}>
        <div className="morning-section-label" style={{ marginBottom: 10 }}>Always-do tasks</div>

        {customTasks.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>No custom tasks yet — add recurring habits below</div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            {customTasks.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{t.title}</div>
                  {t.note && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{t.note}</div>}
                </div>
                <button
                  onClick={() => deleteCustomTask(t.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '0 2px', flexShrink: 0 }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addCustomTask} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            className="agency-form-input"
            style={{ flex: 2, minWidth: 140, margin: 0 }}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Task title"
          />
          <input
            className="agency-form-input"
            style={{ flex: 3, minWidth: 160, margin: 0 }}
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Optional note"
          />
          <button type="submit" className="agency-btn agency-btn-primary agency-btn-sm">Add</button>
        </form>
      </div>

      {/* Section 3 — AI task helper chat */}
      <div className="agency-card">
        <div className="morning-section-label" style={{ marginBottom: 10 }}>AI task helper</div>

        {!claudeKey ? (
          <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>
            Add your Claude API key in Settings to use AI task help
          </div>
        ) : (
          <>
            <div style={{ minHeight: 120, maxHeight: 260, overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && (
                <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>Ask Claude to help with any task — be specific for best results</div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%', fontSize: 13, lineHeight: 1.5,
                  background: m.role === 'user' ? '#0057B8' : '#f1f5f9',
                  color: m.role === 'user' ? '#fff' : '#334155',
                  borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  padding: '8px 12px',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              ))}
              {chatLoading && (
                <div style={{ alignSelf: 'flex-start', fontSize: 12, color: '#94a3b8', padding: '6px 0' }}>Thinking…</div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChat} style={{ display: 'flex', gap: 6 }}>
              <input
                className="agency-form-input"
                style={{ flex: 1, margin: 0 }}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask Claude to help with a task..."
                disabled={chatLoading}
              />
              <button type="submit" className="agency-btn agency-btn-primary agency-btn-sm" disabled={chatLoading || !chatInput.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </div>

    </div>
  );
}

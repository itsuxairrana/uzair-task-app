import { useState, useMemo, useRef } from 'react';
import { useAgencyStore } from '../../store/agencyStore';
import { getStoredKey } from '../../services/aiRouter';

const PLATFORMS  = ['linkedin', 'reddit', 'dribbble', 'blog', 'pinterest'];
const POST_TYPES = ['video_process', 'brand_reveal', 'tool_tutorial', 'for_hire', 'helpful_answer', 'portfolio_post', 'blog_post', 'pin'];
const STATUSES   = ['planned', 'drafted', 'ready', 'posted'];

const PLATFORM_COLOR = {
  linkedin:  '#0A66C2',
  reddit:    '#FF4500',
  dribbble:  '#EA4C89',
  blog:      '#8b5cf6',
  pinterest: '#E60023',
};

const STATUS_CLASS = {
  planned:  'agency-badge-grey',
  drafted:  'agency-badge-blue',
  ready:    'agency-badge-orange',
  posted:   'agency-badge-green',
};

const DAY_NAMES  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const EMPTY = { platform: 'linkedin', post_type: 'for_hire', topic: '', draft: '', status: 'planned', date: '' };

const DAY_OF_WEEK = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 };

function getNextWeekday(targetDow) {
  const today = new Date();
  const todayDow = today.getDay();
  let diff = targetDow - todayDow;
  if (diff <= 0) diff += 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return toISO(d);
}

function detectPlatformAndDate(heading) {
  const h = heading.toLowerCase();
  let platform = 'linkedin';
  let date = toISO(new Date());

  if (h.includes('for hire') || h.includes('reddit')) {
    platform = 'reddit';
  } else if (h.includes('dribbble')) {
    platform = 'dribbble';
  } else if (h.includes('pinterest') || h.includes('pin ')) {
    platform = 'pinterest';
  } else {
    platform = 'linkedin';
  }

  for (const [dayName, dow] of Object.entries(DAY_OF_WEEK)) {
    if (h.includes(dayName)) {
      date = getNextWeekday(dow);
      break;
    }
  }

  return { platform, date };
}

function parseMdFile(text) {
  const sections = text.split(/^##\s+/m).filter(s => s.trim());
  const posts = [];
  for (const section of sections) {
    const lines = section.split('\n');
    const heading = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();
    if (!body) continue;
    const { platform, date } = detectPlatformAndDate(heading);
    posts.push({
      platform,
      date,
      topic: body.replace(/\n/g, ' ').slice(0, 60),
      draft: body,
      status: 'ready',
    });
  }
  return posts;
}

// Get Monday of the week containing `date`
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISO(date) {
  return date.toISOString().split('T')[0];
}

function getLastNDays(n) {
  const days = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(d);
    dd.setDate(d.getDate() - i);
    days.push(toISO(dd));
  }
  return days;
}

async function draftWithClaude(platform, postType, topic) {
  const apiKey = getStoredKey('claude') || import.meta.env.VITE_CLAUDE_API_KEY;
  if (!apiKey) throw new Error('No Claude API key. Add it in ⚙ Settings.');

  const systemPrompt = `You are a social media writer for Uzair Visuals, a startup launch specialist agency from Pakistan targeting Western founders. Brand voice: strategic, confident, direct. No corporate fluff. Platform: ${platform}. Post type: ${postType.replace('_', ' ')}.`;
  const userPrompt   = `Write a post about: ${topic}. Keep it under 280 chars for reddit/pinterest, under 1500 chars for linkedin/blog. Return only the post copy, nothing else.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

export default function ContentCalendar() {
  const { contentPosts, addContentPost, updateContentPost, deleteContentPost } = useAgencyStore();

  const today    = toISO(new Date());
  const [weekStart, setWeekStart] = useState(() => toISO(getMonday(new Date())));
  const [showAdd,   setShowAdd]   = useState(false);
  const [editPost,  setEditPost]  = useState(null);
  const [form,      setForm]      = useState(EMPTY);
  const [expanded,  setExpanded]  = useState({});
  const [drafting,  setDrafting]  = useState({});
  const [draftErr,  setDraftErr]  = useState({});
  const [importMsg, setImportMsg] = useState('');
  const fileInputRef = useRef(null);

  function handleImportClick() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target.result;
      const posts = parseMdFile(text);
      posts.forEach(p => addContentPost(p));
      setImportMsg(`Imported ${posts.length} post${posts.length !== 1 ? 's' : ''} into calendar`);
      setTimeout(() => setImportMsg(''), 4000);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // 7 dates for this week
  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => toISO(addDays(new Date(weekStart), i))),
  [weekStart]);

  function prevWeek() { setWeekStart(toISO(addDays(new Date(weekStart), -7))); }
  function nextWeek() { setWeekStart(toISO(addDays(new Date(weekStart), 7))); }
  function goToday()  { setWeekStart(toISO(getMonday(new Date()))); }

  function openAdd(dateStr) {
    setForm({ ...EMPTY, date: dateStr || today });
    setEditPost(null);
    setShowAdd(true);
  }
  function openEdit(post) {
    setForm({ platform: post.platform, post_type: post.post_type, topic: post.topic, draft: post.draft || '', status: post.status, date: post.date });
    setEditPost(post);
    setShowAdd(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (editPost) {
      updateContentPost(editPost.id, { ...form });
    } else {
      addContentPost({ ...form });
    }
    setShowAdd(false);
  }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleDraft(post) {
    if (!post.topic) return;
    setDrafting(prev => ({ ...prev, [post.id]: true }));
    setDraftErr(prev => ({ ...prev, [post.id]: '' }));
    try {
      const text = await draftWithClaude(post.platform, post.post_type, post.topic);
      updateContentPost(post.id, { draft: text, status: post.status === 'planned' ? 'drafted' : post.status });
      setExpanded(prev => ({ ...prev, [post.id]: true }));
    } catch (err) {
      setDraftErr(prev => ({ ...prev, [post.id]: err.message }));
    } finally {
      setDrafting(prev => ({ ...prev, [post.id]: false }));
    }
  }

  // Heatmap — last 30 days
  const last30 = getLastNDays(30);
  const postsByDate = useMemo(() => {
    const map = {};
    contentPosts.forEach(p => {
      if (!map[p.date]) map[p.date] = [];
      map[p.date].push(p);
    });
    return map;
  }, [contentPosts]);

  // Week label
  const weekEnd = weekDates[6];
  const ws = new Date(weekStart), we = new Date(weekEnd);
  const weekLabel = `${ws.getDate()} ${MONTH_NAMES[ws.getMonth()]} – ${we.getDate()} ${MONTH_NAMES[we.getMonth()]} ${we.getFullYear()}`;

  return (
    <div className="agency-page" style={{ maxWidth: '100%' }}>

      {/* Header */}
      <div className="agency-page-header">
        <div className="agency-page-title">Content Calendar</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={prevWeek}>‹</button>
          <span style={{ fontSize: 13, color: '#475569', minWidth: 160, textAlign: 'center' }}>{weekLabel}</span>
          <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={nextWeek}>›</button>
          <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={goToday}>Today</button>
          <button className="agency-btn agency-btn-secondary" onClick={handleImportClick}>Import .md</button>
          <button className="agency-btn agency-btn-primary" onClick={() => openAdd('')}>+ Add Post</button>
          <input ref={fileInputRef} type="file" accept=".md" style={{ display: 'none' }} onChange={handleFileChange} />
        </div>
      </div>

      {/* Import success banner */}
      {importMsg && (
        <div className="agency-success-banner" style={{ marginBottom: 14 }}>{importMsg}</div>
      )}

      {/* 7-column week grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 24, overflowX: 'auto' }}>
        {weekDates.map((dateStr, i) => {
          const isToday    = dateStr === today;
          const dayPosts   = contentPosts.filter(p => p.date === dateStr);
          const d          = new Date(dateStr + 'T00:00:00');
          const dateLabel  = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;

          return (
            <div key={dateStr} style={{ minWidth: 130 }}>
              {/* Day header */}
              <div style={{
                textAlign: 'center', padding: '6px 4px', marginBottom: 6,
                borderRadius: 6,
                background: isToday ? '#0057B8' : '#f8fafc',
                color: isToday ? '#fff' : '#475569',
                fontWeight: isToday ? 700 : 500,
                fontSize: 12,
              }}>
                <div>{DAY_NAMES[i]}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{dateLabel}</div>
              </div>

              {/* Post cards */}
              {dayPosts.map(post => {
                const isExp  = expanded[post.id];
                const isDrafting = drafting[post.id];
                const err    = draftErr[post.id];

                return (
                  <div key={post.id} style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 7,
                    borderLeft: `3px solid ${PLATFORM_COLOR[post.platform] || '#94a3b8'}`,
                    padding: '8px 10px', marginBottom: 6, fontSize: 12,
                  }}>
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'capitalize',
                        color: PLATFORM_COLOR[post.platform] || '#64748b',
                      }}>
                        {post.platform}
                      </span>
                      <span className={`agency-badge ${STATUS_CLASS[post.status]}`} style={{ fontSize: 9 }}>
                        {post.status}
                      </span>
                    </div>

                    {/* Topic */}
                    <div style={{ color: '#334155', fontSize: 12, marginBottom: 5, lineHeight: 1.3 }}>
                      {post.topic || <span style={{ color: '#94a3b8' }}>No topic</span>}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      <button
                        className="agency-btn agency-btn-secondary agency-btn-sm"
                        style={{ fontSize: 9, padding: '2px 6px' }}
                        onClick={() => toggleExpand(post.id)}
                      >
                        {isExp ? '▲' : '▼'}
                      </button>
                      {post.status !== 'posted' && (
                        <button
                          className="agency-btn agency-btn-secondary agency-btn-sm"
                          style={{ fontSize: 9, padding: '2px 6px' }}
                          onClick={() => handleDraft(post)}
                          disabled={isDrafting || !post.topic}
                          title={!post.topic ? 'Add a topic first' : 'Draft with Claude AI'}
                        >
                          {isDrafting ? '…' : '✦ Draft'}
                        </button>
                      )}
                      <button
                        className="agency-btn agency-btn-secondary agency-btn-sm"
                        style={{ fontSize: 9, padding: '2px 6px' }}
                        onClick={() => openEdit(post)}
                      >
                        ✎
                      </button>
                      <button
                        className="agency-btn agency-btn-danger agency-btn-sm"
                        style={{ fontSize: 9, padding: '2px 6px' }}
                        onClick={() => { if (confirm('Delete this post?')) deleteContentPost(post.id); }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Draft error */}
                    {err && <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 4 }}>{err}</div>}

                    {/* Expanded draft */}
                    {isExp && (
                      <div style={{ marginTop: 8, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                        <textarea
                          style={{ width: '100%', fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 5, padding: 6, resize: 'vertical', fontFamily: 'inherit', color: '#334155', minHeight: 80, boxSizing: 'border-box' }}
                          value={post.draft || ''}
                          placeholder="Draft copy will appear here…"
                          onChange={e => updateContentPost(post.id, { draft: e.target.value })}
                        />
                        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                          {post.status !== 'ready' && post.status !== 'posted' && (
                            <button
                              className="agency-btn agency-btn-secondary agency-btn-sm"
                              style={{ fontSize: 9 }}
                              onClick={() => updateContentPost(post.id, { status: 'ready' })}
                            >
                              ✓ Mark ready
                            </button>
                          )}
                          {post.status !== 'posted' && (
                            <button
                              className="agency-btn agency-btn-primary agency-btn-sm"
                              style={{ fontSize: 9 }}
                              onClick={() => updateContentPost(post.id, { status: 'posted' })}
                            >
                              ✓ Mark posted
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add to this day */}
              <button
                onClick={() => openAdd(dateStr)}
                style={{
                  width: '100%', border: '1px dashed #cbd5e1', borderRadius: 6,
                  background: 'transparent', color: '#94a3b8', fontSize: 11,
                  padding: '5px 0', cursor: 'pointer',
                }}
              >
                + add
              </button>
            </div>
          );
        })}
      </div>

      {/* Monthly heatmap */}
      <div className="agency-card">
        <div className="morning-section-label" style={{ marginBottom: 10 }}>Activity — last 30 days</div>
        <div className="agency-heatmap">
          {last30.map(dateStr => {
            const posts = postsByDate[dateStr] || [];
            const hasPosted  = posts.some(p => p.status === 'posted');
            const hasReady   = posts.some(p => p.status === 'ready');
            const hasDrafted = posts.some(p => p.status === 'drafted');
            const hasPlanned = posts.length > 0;
            const isToday    = dateStr === today;

            const bg = hasPosted ? '#22c55e' : hasReady ? '#f59e0b' : hasDrafted ? '#0057B8' : hasPlanned ? '#cbd5e1' : '#f1f5f9';

            return (
              <div
                key={dateStr}
                className="agency-heatmap-day"
                style={{
                  background: bg,
                  outline: isToday ? '2px solid #0057B8' : 'none',
                  outlineOffset: 1,
                  cursor: 'default',
                }}
                title={`${dateStr} — ${posts.length} post${posts.length !== 1 ? 's' : ''}`}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap' }}>
          <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'#22c55e', marginRight:4, verticalAlign:'middle' }} />Posted</span>
          <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'#f59e0b', marginRight:4, verticalAlign:'middle' }} />Ready</span>
          <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'#0057B8', marginRight:4, verticalAlign:'middle' }} />Drafted</span>
          <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'#cbd5e1', marginRight:4, verticalAlign:'middle' }} />Planned</span>
        </div>
      </div>

      {/* Add / Edit modal */}
      {showAdd && (
        <div className="agency-modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="agency-modal">
            <div className="agency-modal-title">{editPost ? 'Edit Post' : 'Add Post'}</div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Date *</label>
                  <input className="agency-form-input" type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Platform</label>
                  <select className="agency-form-select" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Post Type</label>
                  <select className="agency-form-select" value={form.post_type} onChange={e => setForm(f => ({ ...f, post_type: e.target.value }))}>
                    {POST_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Status</label>
                  <select className="agency-form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>

                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Topic *</label>
                  <input className="agency-form-input" required value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} placeholder="e.g. How we built a brand identity in 3 days" />
                </div>

                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Draft Copy</label>
                  <textarea className="agency-form-textarea" value={form.draft} onChange={e => setForm(f => ({ ...f, draft: e.target.value }))} rows={3} placeholder="Leave blank — use ✦ Draft button to generate with Claude" />
                </div>

              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="agency-btn agency-btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="agency-btn agency-btn-primary">{editPost ? 'Save Changes' : 'Add Post'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

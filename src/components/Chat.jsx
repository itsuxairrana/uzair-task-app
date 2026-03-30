import { useState, useRef, useEffect } from 'react';
import { sendToModel, MODELS, isModelAvailable } from '../services/aiRouter';
import { parseMdToTasks } from '../services/mdParser';

const CHAT_STORAGE_KEY = 'uzair_chat_history';
const LAST_MODEL_KEY   = 'uzair_last_model';

const SUGGESTIONS = [
  { text: 'Plan my week for Uzair Visuals', label: 'Weekly plan' },
  { text: 'Create 3 shirt designs for Ahmed — concepts, revisions, delivery', label: 'Design project' },
  { text: 'Post 3 reels this week for Uzair Visuals Instagram', label: 'Social media' },
  { text: 'Update Upwork profile — headline, skills, portfolio, rate', label: 'Upwork update' },
];

const MODEL_COLOR = {
  free: '#16a34a', gemini: '#4285f4', haiku: '#7c6af7',
  claude: '#7c6af7', gpt4: '#19c37d', grok: '#1d9bf0',
};

export default function Chat({ onTasksParsed }) {
  // Always permanent — chat persists until explicitly cleared
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]'); }
    catch { return []; }
  });
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  // Remember last used model
  const [model, setModel]         = useState(() => localStorage.getItem(LAST_MODEL_KEY) || 'free');
  const [copied, setCopied]       = useState(null);
  const [modelOpen, setModelOpen] = useState(false);

  const fileRef      = useRef(null);
  const bottomRef    = useRef(null);
  const textareaRef  = useRef(null);
  const modelDropRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-save chat on every change
  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // Persist last used model
  function handleSetModel(m) {
    setModel(m);
    localStorage.setItem(LAST_MODEL_KEY, m);
  }

  // Close model dropdown on outside click
  useEffect(() => {
    function onOutside(e) {
      if (!modelDropRef.current?.contains(e.target)) setModelOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function autoGrow() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }

  async function doSend(msgText) {
    const msg = msgText.trim();
    if (!msg || loading) return;
    setInput('');
    setModelOpen(false);
    setTimeout(() => { if (textareaRef.current) textareaRef.current.style.height = 'auto'; }, 0);
    setError('');

    const apiMessages = [
      ...messages.filter(m => m.role === 'user' || m._api).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: msg },
    ];
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const { content, tasks } = await sendToModel(model, apiMessages);
      setMessages(prev => [...prev, { role: 'assistant', content, _api: true, _model: model }]);
      if (tasks.length > 0) onTasksParsed(tasks);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(input); }
  }

  async function handleReload(msgIndex) {
    if (loading) return;
    const msgsUpTo = messages.slice(0, msgIndex);
    setMessages(msgsUpTo);
    setLoading(true);
    setError('');
    const apiMessages = msgsUpTo
      .filter(m => m.role === 'user' || m._api)
      .map(m => ({ role: m.role, content: m.content }));
    try {
      const { content, tasks } = await sendToModel(model, apiMessages);
      setMessages(prev => [...prev, { role: 'assistant', content, _api: true, _model: model }]);
      if (tasks.length > 0) onTasksParsed(tasks);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(rawContent, idx) {
    const plain = rawContent
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    try { await navigator.clipboard.writeText(plain); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = plain; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const text = await file.text();
    setMessages(prev => [...prev, { role: 'user', content: `Attached: ${file.name}` }]);
    setError('');
    setLoading(true);
    try {
      // Always parse MD/TXT files directly — sending to AI loses tasks due to token limits
      const tasks = parseMdToTasks(text);
      if (tasks.length > 0) {
        const platforms = [...new Set(tasks.map(t => t.client_tag).filter(Boolean))];
        const tagLine = platforms.length ? ` · platforms: ${platforms.join(', ')}` : '';
        const content = `Parsed **${tasks.length} tasks** from \`${file.name}\`${tagLine}.`;
        setMessages(prev => [...prev, { role: 'assistant', content, _api: true, _model: 'free' }]);
        onTasksParsed(tasks);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `No tasks found in \`${file.name}\`. Make sure it has checkbox items like \`- [ ] Task title\`.`, _api: true, _model: 'free' }]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError('');
    localStorage.removeItem(CHAT_STORAGE_KEY);
  }

  function renderContent(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  }

  const activeModel = MODELS.find(m => m.id === model);
  const showWelcome = messages.length === 0;

  return (
    <div className="chat-panel">

      {/* ── Header ── */}
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-title">AI Assistant</span>
          {!showWelcome && (
            <button className="chat-new-btn" onClick={clearChat}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              New chat
            </button>
          )}
        </div>
        <div className="chat-header-right" />
      </div>

      {/* ── Messages ── */}
      <div className="chat-messages">

        {showWelcome && (
          <div className="chat-welcome">
            <div className="welcome-mark">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="9" fill="var(--blue)"/>
                <path d="M9 16h14M16 9v14" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="welcome-title">Uzair Task OS</h3>
            <p className="welcome-sub">Describe any work — I'll turn it into structured tasks.</p>
            {model !== 'free' && !isModelAvailable(model) && (
              <div className="welcome-key-warning">
                {activeModel?.label} needs an API key — open Settings to add it.
              </div>
            )}
            <div className="suggestion-grid">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className="suggestion-card" onClick={() => doSend(s.text)}>
                  <span className="sg-label">{s.label}</span>
                  <svg className="sg-arrow" width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 9L9 2M9 2H4M9 2v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={'chat-bubble cb-' + msg.role}>
            {msg.role === 'assistant' && (
              <div className="cb-model-dot" style={{ background: MODEL_COLOR[msg._model] || '#888' }} />
            )}
            <div className="cb-body">
              {msg.role === 'assistant' && (
                <div className="cb-sender">{MODELS.find(m => m.id === msg._model)?.label || 'AI'}</div>
              )}
              <div className="cb-content" dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
              {msg.role === 'assistant' && (
                <div className="cb-actions">
                  <button
                    className={'cb-action-btn' + (copied === i ? ' cb-copied' : '')}
                    onClick={() => handleCopy(renderContent(msg.content), i)}
                  >
                    {copied === i
                      ? <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5 5.5-5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg> Copied</>
                      : <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="3.5" width="6.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2 8V2h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> Copy</>
                    }
                  </button>
                  <button className="cb-action-btn" onClick={() => handleReload(i)} disabled={loading}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6a4 4 0 1 1 1 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M2 8.5V6h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-bubble cb-assistant">
            <div className="cb-model-dot" style={{ background: MODEL_COLOR[model] || '#888' }} />
            <div className="cb-body">
              <div className="cb-sender">{activeModel?.label}</div>
              <div className="cb-content cb-typing">
                <span className="dot"/><span className="dot"/><span className="dot"/>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error-bar">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.4"/><path d="M6.5 4v3M6.5 8.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            {error}
            {error.toLowerCase().includes('key') && (
              <span className="error-hint"> — open <strong>Settings</strong> to add it.</span>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div className="chat-input-area">

        {/* Model selector */}
        <div className="model-selector" ref={modelDropRef}>
          <button className="model-pill" type="button" onClick={() => setModelOpen(o => !o)}>
            <span className="mp-dot" style={{ background: MODEL_COLOR[model] }} />
            <span className="mp-name">{activeModel?.label}</span>
            <svg className={'mp-chevron' + (modelOpen ? ' open' : '')} width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {modelOpen && (
            <div className="model-dropdown">
              <div className="md-label">Select model</div>
              {MODELS.map(m => {
                const hasKey = m.id === 'free' || isModelAvailable(m.id);
                return (
                  <button
                    key={m.id}
                    className={'model-option' + (m.id === model ? ' selected' : '')}
                    type="button"
                    onClick={() => { handleSetModel(m.id); setModelOpen(false); setError(''); }}
                  >
                    <span className="mo-dot" style={{ background: MODEL_COLOR[m.id] || '#888' }} />
                    <div className="mo-info">
                      <span className="mo-name">{m.label}</span>
                      <span className="mo-desc">{hasKey ? m.desc : 'No key — add in Settings'}</span>
                    </div>
                    {m.id === model && (
                      <svg className="mo-check" width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Textarea */}
        <form className="chat-form" onSubmit={e => { e.preventDefault(); doSend(input); }}>
          <input type="file" ref={fileRef} accept=".md,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
          <div className="chat-box">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              value={input}
              onChange={e => { setInput(e.target.value); autoGrow(); }}
              onKeyDown={handleKeyDown}
              placeholder={model === 'free' ? 'Paste task markdown…' : 'Describe your work…'}
              disabled={loading}
              rows={1}
            />
            <div className="chat-box-btns">
              <button type="button" className="cbb-attach" onClick={() => fileRef.current?.click()} disabled={loading} title="Attach .md or .txt">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M3 8V5a4 4 0 0 1 8 0v5.5a2.5 2.5 0 0 1-5 0V6a1 1 0 0 1 2 0v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </button>
              <button type="submit" className="cbb-send" disabled={!input.trim() || loading}>
                {loading
                  ? <><span className="dot"/><span className="dot"/><span className="dot"/></>
                  : <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 11.5V3.5M3.5 7.5l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                }
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

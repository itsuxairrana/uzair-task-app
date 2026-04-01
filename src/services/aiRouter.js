/**
 * AI Router — sends messages to the selected model.
 * Key priority: localStorage → .env
 */

import { parseMdToTasks, parseFallbackJson } from './mdParser';

const TODAY = new Date().toISOString().slice(0, 10);
const LS_PREFIX = 'uzair_key_';

export const MODELS = [
  { id: 'free',   label: 'Free Local',      desc: 'No API — local parser',     envKey: null },
  { id: 'gemini', label: 'Gemini 2.0 Flash',desc: 'Free · Google AI',          envKey: 'VITE_GEMINI_API_KEY' },
  { id: 'haiku',  label: 'Claude Haiku',    desc: 'Fast · cheap · Anthropic',  envKey: 'VITE_CLAUDE_API_KEY' },
  { id: 'claude', label: 'Claude Sonnet',   desc: 'Smart · Anthropic',         envKey: 'VITE_CLAUDE_API_KEY' },
  { id: 'gpt4',   label: 'GPT-4o',          desc: 'Powerful · OpenAI',         envKey: 'VITE_OPENAI_API_KEY' },
  { id: 'grok',   label: 'Grok',            desc: 'Real-time · xAI',           envKey: 'VITE_GROK_API_KEY' },
];

export function setStoredKey(modelId, value) {
  const v = value?.trim();
  if (v) localStorage.setItem(LS_PREFIX + modelId, v);
  else   localStorage.removeItem(LS_PREFIX + modelId);
}
export function getStoredKey(modelId) {
  return localStorage.getItem(LS_PREFIX + modelId) || '';
}
export function clearStoredKey(modelId) {
  localStorage.removeItem(LS_PREFIX + modelId);
}

function getKey(modelId) {
  const model = MODELS.find(m => m.id === modelId);
  if (!model?.envKey) return null;
  const storedId = modelId === 'haiku' ? 'claude' : modelId;
  return getStoredKey(storedId) || import.meta.env[model.envKey] || null;
}

function getTeamNames() {
  try {
    const team = JSON.parse(localStorage.getItem('uzair_team') || '[]');
    return team.map(m => m.name).filter(n => n && n !== 'Uzair');
  } catch { return []; }
}

export function isModelAvailable(modelId) {
  if (modelId === 'free' || modelId === null) return true;
  return !!getKey(modelId);
}

export function buildSystemPrompt() {
  const names = getTeamNames();
  const assignLine = names.length > 0
    ? `\n- Known assignable team members: ${names.join(', ')}. ALWAYS add | Assign: [Name] when any of these names are mentioned in the prompt.`
    : '\n- If any person\'s name is mentioned for assignment, ALWAYS add | Assign: [Name]';
  return `You are a task management AI for Uzair Visuals, a remote growth execution studio. Today: ${TODAY}.

When the user describes work, respond ONLY with this Markdown format:

## Tasks

- [ ] **[Task Title]** — Priority: [High|Medium|Low] | Due: [YYYY-MM-DD]
  Notes: [one clear sentence about what this accomplishes]
  Milestones:
  1. [Specific action title] :: [Exact how-to for this task]
  2. [Specific action title] :: [Exact how-to for this task]
  3. [Specific action title] :: [Exact how-to for this task]

Rules:
- Task title: short verb + object (e.g. "Design shirt concepts for Ahmed")
- 2–3 milestones for simple tasks, up to 4 for complex ones — no filler steps
- Each milestone must be specific to THIS task — no generic "Review" or "Follow up" unless essential
- Due dates: High = today, Medium = +3 days, Low = +7 days
- ALWAYS add | Assign: [Name] when user says "assign to", "for [Name]", "[Name] should", "[Name] will", or mentions a specific person doing the task${assignLine}
- Only add "| Client: Name" if a specific client is mentioned
- Skip "| Time:" unless user gives a specific time
- For advice or non-task questions, respond normally — no task format needed`;
}

// Haiku-specific prompt — stricter to prevent splitting one request into many tasks
function buildHaikuPrompt() {
  const names = getTeamNames();
  const assignLine = names.length > 0
    ? `\n- Known team members to assign: ${names.join(', ')}. Add | Assign: [Name] when mentioned.`
    : '\n- Add | Assign: [Name] when a specific person is mentioned for the task';
  const HAIKU_3DAY = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  return `You are a task management AI for Uzair Visuals. Today: ${TODAY}.

CRITICAL: One user request = EXACTLY ONE task. Never create multiple - [ ] items for a single request.

## Tasks

- [ ] **[Short verb + object]** — Priority: [High|Medium|Low] | Due: [YYYY-MM-DD]
  Notes: [one sentence]
  Milestones:
  1. [Step title] :: [Specific how-to instruction]
  2. [Step title] :: [Specific how-to instruction]
  3. [Step title] :: [Specific how-to instruction]

EXAMPLE — "create 3 shirt designs for Ahmed":
- [ ] **Design shirt concepts for Ahmed** — Priority: Medium | Due: ${HAIKU_3DAY}
  Notes: Three custom shirt designs through concepts, revisions and final delivery.
  Milestones:
  1. Sketch initial concepts :: Create 3 distinct design directions based on Ahmed's brand style
  2. Refine and revise :: Apply feedback, finalize colors and typography
  3. Deliver final files :: Export PNG and source files, send to Ahmed for sign-off

Rules:
- ONE task only — even if request mentions multiple items (3 reels, 5 posts, etc.)
- 2–4 milestones, specific to THIS task, numbered format only
- Milestones are NEVER separate - [ ] items
- ALWAYS add | Assign: [Name] when a person is mentioned for assignment${assignLine}
- For questions or advice, respond normally without task format`;
}

export function buildFallbackParsePrompt(rawText) {
  const names = getTeamNames();
  const assignNote = names.length > 0 ? `\nKnown assignable names: ${names.join(', ')}` : '';
  return `Extract tasks from the following text and return a JSON array.
Each task object must have these exact fields:
{
  "title": string,
  "notes": string,
  "priority": "high"|"medium"|"low",
  "due_date": "YYYY-MM-DD or empty string",
  "due_time": "HH:MM or empty string",
  "assigned_to": "name of person to assign, or Uzair if none mentioned",
  "workspace": "uzair_visuals"|"personal"|"client"|"team",
  "client_tag": string,
  "milestones": [{ "title": string, "instruction": string }]
}
${assignNote}

Text:
${rawText}

Return ONLY the JSON array, no explanation, no markdown.`;
}

export async function sendToModel(modelId, messages) {
  switch (modelId) {
    case 'free':   return sendFree(messages);
    case 'haiku':  return sendClaude(messages, 'claude-haiku-4-5-20251001');
    case 'claude': return sendClaude(messages, 'claude-sonnet-4-20250514');
    case 'gpt4':   return sendGPT4(messages);
    case 'gemini': return sendGemini(messages);
    case 'grok':   return sendGrok(messages);
    default:       return sendFree(messages);
  }
}

function sendFree(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const text = lastUser?.content || '';
  const tasks = parseMdToTasks(text);
  if (tasks.length > 0) return { content: `Parsed ${tasks.length} task(s) locally.`, tasks };
  return {
    content: 'No tasks detected. Try describing your work, or select a model in the dropdown and add an API key in Settings.',
    tasks: [],
  };
}

async function sendClaude(messages, modelName = 'claude-sonnet-4-20250514') {
  const apiKey = getKey('claude');
  if (!apiKey) throw new Error('Claude API key not set. Open Settings → API Keys.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: modelName, max_tokens: 2048, system: modelName.includes('haiku') ? buildHaikuPrompt() : buildSystemPrompt(), messages }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Claude API error ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json();
  const content = data.content?.[0]?.text || '';
  return { content, tasks: await extractTasks(content, 'claude', apiKey, modelName) };
}

async function sendGPT4(messages) {
  const apiKey = getKey('gpt4');
  if (!apiKey) throw new Error('OpenAI API key not set. Open Settings → API Keys.');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o', max_tokens: 2048, messages: [{ role: 'system', content: buildSystemPrompt() }, ...messages] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI API error ${res.status}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { content, tasks: await extractTasks(content, 'gpt4', apiKey) };
}

async function sendGemini(messages) {
  const apiKey = getKey('gemini');
  if (!apiKey) throw new Error('Gemini API key not set. Open Settings — it\'s FREE at aistudio.google.com');

  const geminiContents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: geminiContents,
        generationConfig: { maxOutputTokens: 2048 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { content, tasks: await extractTasks(content, 'gemini', apiKey) };
}

async function sendGrok(messages) {
  const apiKey = getKey('grok');
  if (!apiKey) throw new Error('Grok API key not set. Open Settings → API Keys.');

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'grok-3-latest', max_tokens: 2048, messages: [{ role: 'system', content: buildSystemPrompt() }, ...messages] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Grok API error ${res.status}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { content, tasks: await extractTasks(content, 'grok', apiKey) };
}

async function extractTasks(content, modelId, apiKey, modelName) {
  let tasks = parseMdToTasks(content);
  if (tasks.length > 0) return tasks;
  if (!content.toLowerCase().includes('task') && !content.includes('- [')) return [];

  try {
    const prompt = buildFallbackParsePrompt(content);
    let fallbackContent = '';

    if (modelId === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: modelName || 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
      });
      fallbackContent = (await r.json()).content?.[0]?.text || '';
    } else if (modelId === 'gpt4') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
      });
      fallbackContent = (await r.json()).choices?.[0]?.message?.content || '';
    } else if (modelId === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
      });
      fallbackContent = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (modelId === 'grok') {
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'grok-3-latest', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
      });
      fallbackContent = (await r.json()).choices?.[0]?.message?.content || '';
    }

    return parseFallbackJson(fallbackContent);
  } catch {
    return [];
  }
}

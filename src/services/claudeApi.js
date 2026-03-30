import { parseMdToTasks, buildFallbackParsePrompt, parseFallbackJson } from './mdParser';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You are a task management assistant for Uzair Visuals, a remote growth execution studio.

When the user describes work they need to do, respond with a structured Markdown task list using this exact format:

## Tasks

- [ ] **[Task Title]** — Priority: [High|Medium|Low] | Due: [YYYY-MM-DD] | Time: [HH:MM] | Assign: [Uzair|Junaid|Employee] | Project: [Uzair Visuals|Personal|Client Projects|Team Tasks] | Client: [client name or N/A]
  Notes: [any extra context]

Rules:
- Always infer priority from urgency/importance in user's message
- Default due date: today if urgent, +3 days if normal, +7 days if low priority
- Default assignee: Uzair unless user mentions someone else
- Keep task titles clear and actionable
- Group related tasks together

If the user asks something else (not task-related), answer normally as a helpful business advisor.`;

function getApiKey() {
  return import.meta.env.VITE_CLAUDE_API_KEY || '';
}

/**
 * Send a message to Claude and return { content, tasks }.
 * tasks will be non-empty if Claude returned parseable task markdown.
 */
export async function sendMessage(messages) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Claude API key not set. Add VITE_CLAUDE_API_KEY to your .env file.');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';

  // Try structured MD parse first
  let tasks = parseMdToTasks(content);

  // Fallback: ask Claude to parse freeform text as JSON
  if (tasks.length === 0 && content.toLowerCase().includes('task')) {
    tasks = await fallbackParse(content, apiKey);
  }

  return { content, tasks };
}

async function fallbackParse(rawText, apiKey) {
  try {
    const prompt = buildFallbackParsePrompt(rawText);
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const jsonStr = data.content?.[0]?.text || '';
    return parseFallbackJson(jsonStr);
  } catch {
    return [];
  }
}

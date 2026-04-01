import { v4 as uuidv4 } from 'uuid';

/**
 * Parses Markdown into task objects with milestones.
 *
 * Supported formats:
 *
 * AI format:
 *   - [ ] **Task Title** — Priority: High | Due: 2026-03-18 | Assign: Uzair
 *     Notes: context line
 *     Milestones:
 *     1. Step title :: instruction
 *
 * Roadmap / upload format:
 *   - [ ] **Task Title** `#platform` `30 min` `do-today`
 *     - First sub-bullet becomes notes
 *     - More sub-bullets become milestones
 *       1. Numbered sub-items also become milestones
 *
 * Simple fallback:
 *   - [ ] Plain title (no bold, no meta)
 */

const PRIORITY_MAP = { high: 'high', medium: 'medium', low: 'low' };
const WORKSPACE_MAP = {
  'uzair visuals': 'uzair_visuals',
  'personal': 'personal',
  'client projects': 'client',
  'team tasks': 'team',
};

function normalizeWorkspace(raw) {
  if (!raw) return 'uzair_visuals';
  return WORKSPACE_MAP[raw.trim().toLowerCase()] || 'uzair_visuals';
}

function normalizePriority(raw) {
  if (!raw) return 'medium';
  return PRIORITY_MAP[raw.trim().toLowerCase()] || 'medium';
}

/** Parse pipe-separated meta: "Priority: High | Due: 2026-03-18 | ..." */
function extractMeta(metaStr) {
  const meta = {};
  const parts = metaStr.split('|').map(s => s.trim());
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const key = part.slice(0, colonIdx).trim().toLowerCase();
    const value = part.slice(colonIdx + 1).trim();
    meta[key] = value;
  }
  return meta;
}

/** Parse backtick tags: `#platform` `do-today` `30 min` */
function extractBacktickMeta(str) {
  const meta = {};
  const matches = [...str.matchAll(/`([^`]+)`/g)];
  for (const m of matches) {
    const val = m[1].trim();
    if (val.startsWith('#')) {
      if (!meta.platform) meta.platform = val.slice(1).toLowerCase();
    } else if (val === 'do-today' || val === 'do today') {
      const d = new Date();
      meta.due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    // time strings like "30 min" are ignored (just display info)
  }
  return meta;
}

/**
 * Parse numbered milestone lines starting at startIdx.
 *   1. Step title :: instruction
 *   1. Step title — instruction
 *   1. Step title
 */
function parseMilestones(lines, startIdx) {
  const milestones = [];
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.match(/^[-*]\s*\[/) || line.match(/^##/)) break;
    const mMatch = line.match(/^\d+\.\s+(.+)/);
    if (mMatch) {
      const rest = mMatch[1];
      const sepIdx = rest.indexOf(' :: ');
      const dashIdx = rest.indexOf(' — ');
      let title, instruction;
      if (sepIdx !== -1) {
        title = rest.slice(0, sepIdx).trim();
        instruction = rest.slice(sepIdx + 4).trim();
      } else if (dashIdx !== -1) {
        title = rest.slice(0, dashIdx).trim();
        instruction = rest.slice(dashIdx + 3).trim();
      } else {
        title = rest.trim();
        instruction = '';
      }
      milestones.push({ id: uuidv4(), title, instruction, done: false });
    } else if (line === '' && milestones.length > 0) {
      break;
    }
    i++;
  }
  return { milestones, endIdx: i };
}

export function parseMdToTasks(markdown) {
  const tasks = [];
  const lines = markdown.split('\n');

  // Track section context for roadmap-style files
  let currentPlatform = ''; // from ### Section headers

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track ### sub-section headers (e.g., "### Fiverr" → platform = "fiverr")
    const sectionMatch = line.match(/^###\s+(.+)/);
    if (sectionMatch) {
      currentPlatform = sectionMatch[1].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      continue;
    }
    // Reset platform on new ## Phase header (sub-sections will re-set it)
    if (line.match(/^##\s/)) {
      currentPlatform = '';
      continue;
    }

    // ── Full format: - [ ] **Title** — meta  OR  - [ ] **Title** `tags`
    const fullMatch = line.match(/^[-*]\s*\[\s*\]\s*\*\*(.+?)\*\*\s*(?:—|--)?\s*(.*)/);
    // ── Simple format: - [ ] Plain title (no bold)
    const simpleMatch = !fullMatch && line.match(/^[-*]\s*\[\s*\]\s+([^*].+)/);

    if (fullMatch || simpleMatch) {
      const title = fullMatch ? fullMatch[1].trim() : simpleMatch[1].trim();
      const metaStr = fullMatch ? fullMatch[2].trim() : '';

      const meta = extractMeta(metaStr);      // pipe-separated: "Priority: High | Due: ..."
      const btMeta = extractBacktickMeta(metaStr); // backtick: `#fiverr` `do-today`

      // Platform tag: backtick tag overrides section header
      const platform = btMeta.platform || currentPlatform || '';

      let notes = meta['notes'] || '';
      let milestones = [];

      // Scan following indented lines for Notes:, Milestones:, sub-bullets, numbered items
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        const nextTrimmed = next.trim();

        // Stop at next top-level task
        if (nextTrimmed.match(/^[-*]\s*\[/) && !next.startsWith('  ') && !next.startsWith('\t')) break;
        // Stop at section headers
        if (nextTrimmed.match(/^##/)) break;

        // Explicit Notes: line
        const notesMatch = nextTrimmed.match(/^Notes?:\s*(.*)/i);
        if (notesMatch) {
          notes = notesMatch[1].trim();
          j++;
          continue;
        }

        // Explicit Milestones: header
        if (nextTrimmed.match(/^Milestones?:/i)) {
          j++;
          const result = parseMilestones(lines, j);
          milestones = result.milestones;
          j = result.endIdx;
          continue;
        }

        // Numbered milestone inline (with or without "Milestones:" header)
        if (nextTrimmed.match(/^\d+\.\s+/)) {
          const result = parseMilestones(lines, j);
          if (result.milestones.length > 0) {
            milestones = [...milestones, ...result.milestones];
            j = result.endIdx;
            continue;
          }
        }

        // Indented sub-bullet (roadmap format): first → notes, rest → milestones
        if (
          (next.startsWith('  ') || next.startsWith('\t')) &&
          nextTrimmed.match(/^[-*]\s/) &&
          !nextTrimmed.match(/^[-*]\s*\[/)
        ) {
          const content = nextTrimmed.replace(/^[-*]\s+/, '').trim();
          if (!notes) {
            notes = content;
          } else {
            milestones.push({ id: uuidv4(), title: content, instruction: '', done: false });
          }
          j++;
          continue;
        }

        j++;
      }
      i = j - 1; // outer loop will i++ to j

      tasks.push({
        id: uuidv4(),
        title,
        notes,
        priority: normalizePriority(meta['priority']),
        status: 'todo',
        due_date: meta['due'] || btMeta.due || '',
        due_time: meta['time'] || '',
        assigned_to: meta['assign'] || meta['assigned'] || meta['assigned to'] || meta['assignee'] || 'Uzair',
        workspace: normalizeWorkspace(meta['project']),
        client_tag: meta['client'] && meta['client'] !== 'N/A' ? meta['client'] : platform,
        source: 'ai_parsed',
        created_at: new Date().toISOString(),
        milestones,
        google_calendar_event_id: null,
        google_task_id: null,
      });
    }
  }

  return tasks;
}

/**
 * Free local parser — no AI needed.
 */
export function parseLocalMd(text) {
  return parseMdToTasks(text);
}

/**
 * Build fallback prompt for when AI returns unstructured text.
 */
export function buildFallbackParsePrompt(rawText) {
  return `Extract tasks from the following text and return a JSON array.
Each task object must have these exact fields:
{
  "title": string,
  "notes": string,
  "priority": "high"|"medium"|"low",
  "due_date": "YYYY-MM-DD or empty string",
  "due_time": "HH:MM or empty string",
  "assigned_to": "Uzair"|"Junaid"|"Employee",
  "workspace": "uzair_visuals"|"personal"|"client"|"team",
  "client_tag": string,
  "milestones": [{ "title": string, "instruction": string }]
}

Text:
${rawText}

Return ONLY the JSON array, no explanation, no markdown.`;
}

/**
 * Parse raw JSON string returned by AI fallback parser.
 */
export function parseFallbackJson(jsonStr) {
  try {
    const match = jsonStr.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]);
    return arr.map(item => ({
      id: uuidv4(),
      title: item.title || 'Untitled Task',
      notes: item.notes || '',
      priority: item.priority === 'high' ? 'high' : item.priority === 'low' ? 'low' : 'medium',
      status: 'todo',
      due_date: item.due_date || '',
      due_time: item.due_time || '',
      assigned_to: item.assigned_to || 'Uzair',
      workspace: item.workspace || 'uzair_visuals',
      client_tag: item.client_tag || '',
      source: 'ai_parsed',
      created_at: new Date().toISOString(),
      milestones: (item.milestones || []).map(m => ({
        id: uuidv4(),
        title: m.title || '',
        instruction: m.instruction || '',
        done: false,
      })),
      google_calendar_event_id: null,
      google_task_id: null,
    }));
  } catch {
    return [];
  }
}

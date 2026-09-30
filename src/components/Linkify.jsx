// Renders plain text with http(s) / www. links as clickable anchors that open in a new tab.
// Everything else stays text (React escapes it), so this is safe for user-written content.
const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

export default function Linkify({ text }) {
  if (!text) return null;
  const parts = [];
  let last = 0;
  for (const m of String(text).matchAll(URL_RE)) {
    let url = m[0];
    const trail = url.match(TRAILING)?.[0] || '';
    if (trail) url = url.slice(0, -trail.length);
    if (m.index > last) parts.push(text.slice(last, m.index));
    const href = url.startsWith('www.') ? `https://${url}` : url;
    parts.push(
      <a key={m.index} href={href} target="_blank" rel="noopener noreferrer" className="text-link" onClick={e => e.stopPropagation()}>
        {prettyUrl(url)}
      </a>,
    );
    last = m.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// Show "drive.google.com/…/view" rather than a 200-character URL.
function prettyUrl(url) {
  const bare = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return bare.length > 48 ? `${bare.slice(0, 30)}…${bare.slice(-14)}` : bare;
}

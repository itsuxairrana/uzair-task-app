import { useEffect, useRef, useState } from 'react';
import { fetchFileBlob } from '../services/collabApi';
import Icon from './Icon';

// Types that open in a new tab; anything else downloads. (Never html/svg: a blob URL runs on our origin.)
const VIEWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']);
const IMAGE = /^image\/(png|jpeg|gif|webp)$/;

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

async function openFile(f) {
  const viewable = VIEWABLE.has(f.type);
  // Open the tab inside the click so it isn't blocked as a popup, then point it at the file.
  const win = viewable ? window.open('', '_blank') : null;
  try {
    const blob = await fetchFileBlob(f.id);
    const url = URL.createObjectURL(viewable ? new Blob([blob], { type: f.type }) : blob);
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      // Not viewable, or the browser blocked the new tab: download it instead.
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    win?.close();
    alert(e.message);
  }
}

// Paperclip button with a hidden file picker.
export function AttachButton({ onFiles, disabled, label = 'Attach files', className = 'btn btn-ghost btn-icon' }) {
  const input = useRef(null);
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()} disabled={disabled} aria-label={label} title={label}>
        <Icon name="paperclip" size={16} />{className.includes('btn-icon') ? null : <span>{label}</span>}
      </button>
      <input
        ref={input} type="file" multiple hidden
        onChange={e => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; }}
      />
    </>
  );
}

// Files picked but not sent yet, with upload progress.
export function PendingFiles({ items, onRemove }) {
  if (!items.length) return null;
  return (
    <div className="file-chips">
      {items.map(it => (
        <div key={it.key} className={'file-chip is-pending' + (it.status === 'error' ? ' is-error' : '')} title={it.error || it.name}>
          <Icon name={it.status === 'error' ? 'alert' : 'paperclip'} size={13} />
          <span className="file-chip-name">{it.name}</span>
          <span className="file-chip-size">{it.status === 'error' ? it.error : it.status === 'uploading' ? `${Math.round(it.progress * 100)}%` : fmtSize(it.size)}</span>
          {it.status === 'uploading' && <span className="file-chip-bar" style={{ width: `${Math.round(it.progress * 100)}%` }} />}
          <button type="button" className="file-chip-x" onClick={() => onRemove(it)} aria-label={`Remove ${it.name}`}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  );
}

function Thumb({ file }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url = null;
    let live = true;
    fetchFileBlob(file.id).then(b => {
      if (!live) return;
      url = URL.createObjectURL(new Blob([b], { type: file.type }));
      setSrc(url);
    }, () => {});
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [file.id, file.type]);
  return src ? <img src={src} alt={file.name} /> : <span className="file-thumb-ph"><Icon name="paperclip" size={16} /></span>;
}

// Files on a sent message. Images show a preview; click opens (or downloads) the file.
export function FileList({ files }) {
  if (!files?.length) return null;
  const images = files.filter(f => IMAGE.test(f.type));
  const others = files.filter(f => !IMAGE.test(f.type));
  return (
    <div className="file-list">
      {images.length > 0 && (
        <div className="file-thumbs">
          {images.map(f => (
            <button key={f.id} type="button" className="file-thumb" onClick={() => openFile(f)} title={`${f.name} · ${fmtSize(f.size)}`}>
              <Thumb file={f} />
            </button>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="file-chips">
          {others.map(f => (
            <button key={f.id} type="button" className="file-chip" onClick={() => openFile(f)} title={VIEWABLE.has(f.type) ? 'Open in a new tab' : 'Download'}>
              <Icon name="paperclip" size={13} />
              <span className="file-chip-name">{f.name}</span>
              <span className="file-chip-size">{fmtSize(f.size)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

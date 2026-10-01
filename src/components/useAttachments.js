import { useEffect, useRef, useState } from 'react';
import { uploadFile, removeUpload, MAX_FILE_MB } from '../services/collabApi';

export const MAX_FILES = 10;
let seq = 0;

// Files picked in a composer: each one uploads right away, and `ids` are sent with the message.
export default function useAttachments(taskId) {
  const [items, setItems]   = useState([]);
  const [notice, setNotice] = useState('');
  const latest = useRef(items);
  useEffect(() => { latest.current = items; }, [items]);

  // Closing without sending: drop the uploads (the server also clears unsent files daily).
  useEffect(() => () => {
    for (const i of latest.current) if (i.id) removeUpload(i.id).catch(() => {});
  }, []);

  const update = (key, patch) => setItems(cur => cur.map(i => (i.key === key ? { ...i, ...patch } : i)));

  function add(fileList) {
    const files = [...fileList];
    const room = MAX_FILES - items.length;
    setNotice(files.length > room ? `You can attach up to ${MAX_FILES} files at a time.` : '');
    const fresh = files.slice(0, Math.max(0, room)).map(f => ({
      key: ++seq, file: f, name: f.name || 'file', size: f.size, type: f.type, progress: 0,
      status: f.size > MAX_FILE_MB * 1024 * 1024 ? 'error' : f.size === 0 ? 'error' : 'uploading',
      error: f.size > MAX_FILE_MB * 1024 * 1024 ? `Over ${MAX_FILE_MB} MB` : f.size === 0 ? 'Empty file' : '',
    }));
    setItems(cur => [...cur, ...fresh]);
    for (const it of fresh) {
      if (it.status !== 'uploading') continue;
      uploadFile(taskId, it.file, p => update(it.key, { progress: p }))
        .then(f => update(it.key, { status: 'done', id: f.id, progress: 1 }))
        .catch(e => update(it.key, { status: 'error', error: e.message }));
    }
  }

  function remove(item) {
    setItems(cur => cur.filter(i => i.key !== item.key));
    setNotice('');
    if (item.id) removeUpload(item.id).catch(() => {});
  }

  // After sending: the files now belong to the message, so forget them without deleting.
  function clear() {
    latest.current = [];
    setItems([]);
    setNotice('');
  }

  return {
    items, add, remove, clear, notice,
    ids: items.filter(i => i.status === 'done').map(i => i.id),
    uploading: items.some(i => i.status === 'uploading'),
  };
}

import { useTaskStore } from '../store/taskStore';

const WORKSPACES = [
  { id: 'all', label: 'All' },
  { id: 'uzair_visuals', label: 'Uzair Visuals' },
  { id: 'personal', label: 'Personal' },
  { id: 'client', label: 'Client Projects' },
  { id: 'team', label: 'Team Tasks' },
];

export default function WorkspaceTabs() {
  const activeWorkspace = useTaskStore(s => s.activeWorkspace);
  const setActiveWorkspace = useTaskStore(s => s.setActiveWorkspace);
  const tasks = useTaskStore(s => s.tasks);

  function countFor(wsId) {
    if (wsId === 'all') return tasks.filter(t => t.status !== 'done').length;
    return tasks.filter(t => t.workspace === wsId && t.status !== 'done').length;
  }

  return (
    <div className="workspace-tabs">
      {WORKSPACES.map(ws => (
        <button
          key={ws.id}
          className={`tab-btn${activeWorkspace === ws.id ? ' active' : ''}`}
          onClick={() => setActiveWorkspace(ws.id)}
        >
          {ws.label}
          {countFor(ws.id) > 0 && (
            <span className="tab-count">{countFor(ws.id)}</span>
          )}
        </button>
      ))}
    </div>
  );
}

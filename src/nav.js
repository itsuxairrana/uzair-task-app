// Sidebar structure and page titles.
export const NAV_GROUPS = [
  {
    id: 'home', label: null, items: [
      { id: 'morning_hq', label: 'Morning HQ', icon: 'sun' },
      { id: 'tasks',      label: 'My tasks',   icon: 'listChecks' },
      { id: 'today',      label: 'Today',      icon: 'calendar' },
      { id: 'overdue',    label: 'Overdue',    icon: 'alert' },
    ],
  },
  {
    id: 'agency', label: 'Agency', items: [
      { id: 'team',             label: 'Team',     icon: 'users' },
      { id: 'pipeline',         label: 'Clients',  icon: 'briefcase' },
      { id: 'projects',         label: 'Projects', icon: 'folder' },
      { id: 'revenue',          label: 'Revenue',  icon: 'wallet' },
      { id: 'content_calendar', label: 'Content',  icon: 'newspaper' },
    ],
  },
  {
    id: 'routine', label: 'Routine', items: [
      { id: 'platform_checklist', label: 'Daily platforms', icon: 'checkCircle' },
      { id: 'daily_tasks',        label: 'Daily tasks',     icon: 'clipboard' },
      { id: 'weekly_review',      label: 'Weekly review',   icon: 'chart' },
    ],
  },
];

export const NAV_LABEL = Object.fromEntries(NAV_GROUPS.flatMap(g => g.items.map(i => [i.id, i.label])));

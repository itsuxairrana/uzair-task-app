import { create } from 'zustand';

// Layout preferences survive reloads; navigation state does not.
const LS_KEY = 'uzair_ui_prefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function savePrefs(state) {
  const { sidebarCollapsed, aiOpen, theme } = state;
  try { localStorage.setItem(LS_KEY, JSON.stringify({ sidebarCollapsed, aiOpen, theme })); } catch { /* storage unavailable */ }
}

const prefs = loadPrefs();

export const useUiStore = create((set, get) => ({
  activeNav: 'morning_hq',
  // Optional payload for the destination page, e.g. { taskId } to highlight a team task.
  navFocus: null,
  sidebarCollapsed: !!prefs.sidebarCollapsed,
  aiOpen: prefs.aiOpen ?? true,
  theme: prefs.theme || 'system', // 'system' | 'light' | 'dark'
  mobileNavOpen: false,
  settingsTab: null, // null = closed, otherwise the tab to show

  navigate(id, focus = null) {
    if (id === 'settings') { set({ settingsTab: 'keys', mobileNavOpen: false }); return; }
    set({ activeNav: id, navFocus: focus, mobileNavOpen: false });
  },
  clearFocus() { set({ navFocus: null }); },

  toggleSidebar() { set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })); savePrefs(get()); },
  setAiOpen(open) { set({ aiOpen: open }); savePrefs(get()); },
  toggleAi() { set(s => ({ aiOpen: !s.aiOpen })); savePrefs(get()); },
  setTheme(theme) { set({ theme }); savePrefs(get()); },
  setMobileNavOpen(open) { set({ mobileNavOpen: open }); },

  openSettings(tab = 'keys') { set({ settingsTab: tab, mobileNavOpen: false }); },
  closeSettings() { set({ settingsTab: null }); },
}));

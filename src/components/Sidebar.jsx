import { useUiStore } from '../store/uiStore';
import Icon from './Icon';
import { NAV_GROUPS } from '../nav';

const THEMES = [
  { id: 'light',  icon: 'sun',     label: 'Light' },
  { id: 'dark',   icon: 'moon',    label: 'Dark' },
  { id: 'system', icon: 'monitor', label: 'System' },
];

export default function Sidebar({ badges, google, onLogout, authUser }) {
  const activeNav = useUiStore(s => s.activeNav);
  const navigate = useUiStore(s => s.navigate);
  const collapsed = useUiStore(s => s.sidebarCollapsed);
  const toggleSidebar = useUiStore(s => s.toggleSidebar);
  const mobileOpen = useUiStore(s => s.mobileNavOpen);
  const setMobileOpen = useUiStore(s => s.setMobileNavOpen);
  const theme = useUiStore(s => s.theme);
  const setTheme = useUiStore(s => s.setTheme);
  const openSettings = useUiStore(s => s.openSettings);

  return (
    <>
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={'sidebar' + (collapsed ? ' is-collapsed' : '') + (mobileOpen ? ' is-mobile-open' : '')}>
        <div className="sidebar-head">
          <div className="brand">
            <span className="brand-mark">UV</span>
            <span className="brand-text">
              <span className="brand-name">Task OS</span>
              <span className="brand-sub">Uzair Visuals</span>
            </span>
          </div>
          <button className="icon-btn sidebar-collapse-btn" onClick={toggleSidebar} title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'} aria-label="Toggle sidebar">
            <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} />
          </button>
          <button className="icon-btn sidebar-close-btn" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <Icon name="x" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map(group => (
            <div key={group.id} className="nav-group">
              {group.label && <div className="nav-group-label">{group.label}</div>}
              {group.items.map(item => {
                const badge = badges[item.id];
                return (
                  <button
                    key={item.id}
                    className={'nav-item' + (activeNav === item.id ? ' is-active' : '')}
                    onClick={() => navigate(item.id)}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon name={item.icon} size={17} />
                    <span className="nav-label">{item.label}</span>
                    {badge?.type === 'count' && <span className={`nav-badge nav-badge-${badge.tone}`}>{badge.value}</span>}
                    {badge?.type === 'dot' && <span className={`nav-dot nav-badge-${badge.tone}`} />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="theme-switch" role="radiogroup" aria-label="Theme">
            {THEMES.map(t => (
              <button
                key={t.id}
                className={'theme-opt' + (theme === t.id ? ' is-active' : '')}
                onClick={() => setTheme(t.id)}
                title={`${t.label} theme`}
                role="radio" aria-checked={theme === t.id}
              >
                <Icon name={t.icon} size={14} />
              </button>
            ))}
          </div>

          <button className="nav-item" onClick={() => openSettings(google.connected ? 'keys' : 'google')} title={collapsed ? 'Settings' : undefined}>
            <Icon name="sliders" size={17} />
            <span className="nav-label">Settings</span>
            {!google.connected && google.configured && <span className="nav-dot nav-badge-orange" title="Google not connected" />}
          </button>

          <div className="account">
            {google.connected && google.user?.picture
              ? <img src={google.user.picture} alt="" className="avatar" referrerPolicy="no-referrer" />
              : <span className="avatar">{(authUser?.name || 'U').charAt(0).toUpperCase()}</span>}
            <div className="account-info">
              <div className="account-name">{authUser?.name || 'Admin'}</div>
              <div className="account-sub">{google.connected ? 'Google connected' : 'Google not connected'}</div>
            </div>
            <button className="icon-btn account-logout" onClick={onLogout} title="Sign out" aria-label="Sign out">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

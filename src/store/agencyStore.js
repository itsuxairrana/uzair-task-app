import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

const KEYS = {
  dailyChecks:     'uzair_agency_daily_checks',
  revenue:         'uzair_agency_revenue',
  revSettings:     'uzair_agency_revenue_settings',
  invoices:        'uzair_agency_invoices',
  clients:         'uzair_agency_clients',
  projects:        'uzair_agency_projects',
  teamTasks:       'uzair_agency_team_tasks',
  content:         'uzair_agency_content',
  upworkProposals: 'uzair_agency_upwork_proposals',
  weeklyNotes:     'uzair_agency_weekly_notes',
  teamMembers:     'uzair_agency_team_members',
  platforms:       'uzair_agency_platforms',
};

const DEFAULT_REV = { monthlyTarget: 150000, usdRate: 278, gbpRate: 350 };

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

export const useAgencyStore = create((set, get) => ({

  // ── DAILY CHECKS ─────────────────────────────────────────────────────────
  dailyChecks: load(KEYS.dailyChecks, {}),

  togglePlatformCheck(platform) {
    const today = new Date().toISOString().split('T')[0];
    set(st => {
      const c = { ...st.dailyChecks };
      c[today] = { ...(c[today]||{}), [platform]: !(c[today]||{})[platform] };
      save(KEYS.dailyChecks, c);
      return { dailyChecks: c };
    });
  },

  getTodayChecks() {
    return get().dailyChecks[new Date().toISOString().split('T')[0]] || {};
  },

  getDayChecks(d) { return get().dailyChecks[d] || {}; },

  computeStreak() {
    const checks = get().dailyChecks;
    const ps = get().platforms.map(p => p.id);
    if (!ps.length) return 0;
    let streak = 0;
    const d = new Date(); d.setDate(d.getDate() - 1);
    while (streak < 365) {
      const key = d.toISOString().split('T')[0];
      if (!ps.every(p => (checks[key]||{})[p])) break;
      streak++; d.setDate(d.getDate() - 1);
    }
    return streak;
  },

  // ── REVENUE ──────────────────────────────────────────────────────────────
  revenueEntries:  load(KEYS.revenue, []),
  revenueSettings: load(KEYS.revSettings, DEFAULT_REV),

  addRevenue(entry) {
    const e = { id: uuidv4(), created_at: new Date().toISOString(), ...entry };
    set(st => { const a = [...st.revenueEntries, e]; save(KEYS.revenue, a); return { revenueEntries: a }; });
  },

  deleteRevenue(id) {
    set(st => { const a = st.revenueEntries.filter(e => e.id !== id); save(KEYS.revenue, a); return { revenueEntries: a }; });
  },

  updateRevenueSettings(s) {
    const m = { ...get().revenueSettings, ...s }; save(KEYS.revSettings, m); set({ revenueSettings: m });
  },

  toPKR(amount, currency) {
    const { usdRate, gbpRate } = get().revenueSettings;
    if (currency === 'USD') return amount * usdRate;
    if (currency === 'GBP') return amount * gbpRate;
    return amount;
  },

  getThisMonthEntries() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    return get().revenueEntries.filter(e => e.date?.startsWith(ym));
  },

  getThisMonthTotalPKR() {
    return get().getThisMonthEntries().reduce((s,e) => s + get().toPKR(Number(e.amount)||0, e.currency), 0);
  },

  getJunaidCommissionThisMonth() {
    const rateMap = { junaid_direct:0.30, junaid_ig:0.20, junaid_referral:0.15 };
    let total = 0;
    const breakdown = { junaid_direct:0, junaid_ig:0, junaid_referral:0 };
    get().getThisMonthEntries().forEach(e => {
      const rate = rateMap[e.lead_source]; if (!rate) return;
      const rev = get().toPKR(Number(e.amount)||0, e.currency);
      const net = rev - (Number(e.direct_cost)||0) - (rev * 0.10);
      const comm = Math.max(0, net) * rate;
      total += comm; breakdown[e.lead_source] = (breakdown[e.lead_source]||0) + comm;
    });
    return { total, breakdown };
  },

  // ── INVOICES ─────────────────────────────────────────────────────────────
  invoices: load(KEYS.invoices, []),

  addInvoice(invoice) {
    const i = { id: uuidv4(), paid: false, paid_date: null, created_at: new Date().toISOString(), ...invoice };
    set(st => { const a = [...st.invoices, i]; save(KEYS.invoices, a); return { invoices: a }; });
  },

  markInvoicePaid(id) {
    set(st => {
      const a = st.invoices.map(i => i.id === id ? { ...i, paid: true, paid_date: new Date().toISOString().split('T')[0] } : i);
      save(KEYS.invoices, a); return { invoices: a };
    });
  },

  deleteInvoice(id) {
    set(st => { const a = st.invoices.filter(i => i.id !== id); save(KEYS.invoices, a); return { invoices: a }; });
  },

  getUnpaidInvoices() { return get().invoices.filter(i => !i.paid); },

  getOverdueInvoices() {
    const today = new Date().toISOString().split('T')[0];
    return get().invoices.filter(i => !i.paid && i.due_date && i.due_date < today);
  },

  // ── CLIENTS ──────────────────────────────────────────────────────────────
  clients: load(KEYS.clients, []),

  addClient(client) {
    const c = { id: uuidv4(), stage:'lead', lead_source:'company', proposal_sent_date:null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...client };
    set(st => { const a = [...st.clients, c]; save(KEYS.clients, a); return { clients: a }; });
  },

  updateClient(id, updates) {
    set(st => {
      const a = st.clients.map(c => c.id === id ? { ...c, ...updates, updated_at: new Date().toISOString() } : c);
      save(KEYS.clients, a); return { clients: a };
    });
  },

  deleteClient(id) {
    set(st => { const a = st.clients.filter(c => c.id !== id); save(KEYS.clients, a); return { clients: a }; });
  },

  moveClient(id, newStage) {
    const upd = { stage: newStage };
    if (newStage === 'proposal') upd.proposal_sent_date = new Date().toISOString().split('T')[0];
    get().updateClient(id, upd);
  },

  getClientsByStage(stage) { return get().clients.filter(c => c.stage === stage); },

  getProposalsNeedingFollowUp() {
    const today = new Date();
    return get().clients
      .filter(c => c.stage === 'proposal' && c.proposal_sent_date)
      .map(c => ({ ...c, days_waiting: Math.floor((today - new Date(c.proposal_sent_date)) / 86400000) }))
      .filter(c => c.days_waiting >= 2)
      .sort((a,b) => b.days_waiting - a.days_waiting);
  },

  // ── PROJECTS ─────────────────────────────────────────────────────────────
  projects: load(KEYS.projects, []),

  addProject(project) {
    const p = { id: uuidv4(), deliverables:[], revision_round:1, created_at: new Date().toISOString(), ...project };
    set(st => { const a = [...st.projects, p]; save(KEYS.projects, a); return { projects: a }; });
  },

  updateProject(id, upd) {
    set(st => { const a = st.projects.map(p => p.id === id ? { ...p, ...upd } : p); save(KEYS.projects, a); return { projects: a }; });
  },

  deleteProject(id) {
    set(st => { const a = st.projects.filter(p => p.id !== id); save(KEYS.projects, a); return { projects: a }; });
  },

  toggleDeliverableReviewed(projId, delId) {
    set(st => {
      const a = st.projects.map(p => p.id !== projId ? p : {
        ...p, deliverables: p.deliverables.map(d => d.id === delId ? { ...d, uzair_reviewed: !d.uzair_reviewed } : d)
      });
      save(KEYS.projects, a); return { projects: a };
    });
  },

  toggleDeliverableDone(projId, delId) {
    set(st => {
      const a = st.projects.map(p => p.id !== projId ? p : {
        ...p, deliverables: p.deliverables.map(d => {
          if (d.id !== delId || !d.uzair_reviewed) return d;
          return { ...d, done: !d.done };
        })
      });
      save(KEYS.projects, a); return { projects: a };
    });
  },

  // ── TEAM TASKS ───────────────────────────────────────────────────────────
  teamTasks: load(KEYS.teamTasks, []),

  addTeamTask(task) {
    const t = { id: uuidv4(), status:'todo', uzair_approved:false, created_at: new Date().toISOString(), ...task };
    set(st => { const a = [...st.teamTasks, t]; save(KEYS.teamTasks, a); return { teamTasks: a }; });
  },

  updateTeamTask(id, upd) {
    set(st => { const a = st.teamTasks.map(t => t.id === id ? { ...t, ...upd } : t); save(KEYS.teamTasks, a); return { teamTasks: a }; });
  },

  deleteTeamTask(id) {
    set(st => { const a = st.teamTasks.filter(t => t.id !== id); save(KEYS.teamTasks, a); return { teamTasks: a }; });
  },

  approveTeamTask(id) { get().updateTeamTask(id, { status:'done', uzair_approved:true }); },

  // ── CONTENT POSTS ────────────────────────────────────────────────────────
  contentPosts: load(KEYS.content, []),

  addContentPost(post) {
    const p = { id: uuidv4(), status:'planned', draft:'', created_at: new Date().toISOString(), ...post };
    set(st => { const a = [...st.contentPosts, p]; save(KEYS.content, a); return { contentPosts: a }; });
  },

  updateContentPost(id, upd) {
    set(st => { const a = st.contentPosts.map(p => p.id === id ? { ...p, ...upd } : p); save(KEYS.content, a); return { contentPosts: a }; });
  },

  deleteContentPost(id) {
    set(st => { const a = st.contentPosts.filter(p => p.id !== id); save(KEYS.content, a); return { contentPosts: a }; });
  },

  // ── UPWORK PROPOSALS ─────────────────────────────────────────────────────
  upworkProposals: load(KEYS.upworkProposals, []),

  addUpworkProposal(proposal) {
    const p = { id: uuidv4(), status:'applied', follow_up_sent:false, follow_up_date:null,
      created_at: new Date().toISOString(), ...proposal };
    set(st => { const a = [...st.upworkProposals, p]; save(KEYS.upworkProposals, a); return { upworkProposals: a }; });
  },

  updateUpworkProposal(id, upd) {
    set(st => { const a = st.upworkProposals.map(p => p.id === id ? { ...p, ...upd } : p); save(KEYS.upworkProposals, a); return { upworkProposals: a }; });
  },

  deleteUpworkProposal(id) {
    set(st => { const a = st.upworkProposals.filter(p => p.id !== id); save(KEYS.upworkProposals, a); return { upworkProposals: a }; });
  },

  getProposalsNeedingUpworkFollowUp() {
    const today = new Date();
    return get().upworkProposals
      .filter(p => p.status === 'applied' && !p.follow_up_sent && p.applied_date)
      .map(p => ({ ...p, days_waiting: Math.floor((today - new Date(p.applied_date)) / 86400000) }))
      .filter(p => p.days_waiting >= 5)
      .sort((a,b) => b.days_waiting - a.days_waiting);
  },

  // ── WEEKLY NOTES ─────────────────────────────────────────────────────────
  weeklyNotes: load(KEYS.weeklyNotes, {}),

  getCurrentWeekKey() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const wk = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`;
  },

  saveWeeklyNote(weekKey, text) {
    set(st => { const n = { ...st.weeklyNotes, [weekKey]: text }; save(KEYS.weeklyNotes, n); return { weeklyNotes: n }; });
  },

  getWeeklyNote(weekKey) { return get().weeklyNotes[weekKey] || ''; },

  // ── TEAM MEMBERS ─────────────────────────────────────────────────────────
  teamMembers: load(KEYS.teamMembers, ['Junaid', 'Hamza', 'Collaborator']),

  addTeamMember(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    set(st => {
      if (st.teamMembers.includes(trimmed)) return {};
      const a = [...st.teamMembers, trimmed];
      save(KEYS.teamMembers, a);
      return { teamMembers: a };
    });
  },

  removeTeamMember(name) {
    const hasActive = get().teamTasks.some(t => t.assignee === name && t.status !== 'done');
    if (hasActive) return false;
    set(st => {
      const a = st.teamMembers.filter(m => m !== name);
      save(KEYS.teamMembers, a);
      return { teamMembers: a };
    });
    return true;
  },

  // ── PLATFORMS ────────────────────────────────────────────────────────────
  platforms: load(KEYS.platforms, [
    { id: 'linkedin',  name: 'LinkedIn',  color: '#0A66C2', tasks: 'Post content · Send 10 connections · Comment on 5 posts' },
    { id: 'reddit',    name: 'Reddit',    color: '#FF4500', tasks: 'Post [FOR HIRE] · Reply to 2 hiring threads' },
    { id: 'discord',   name: 'Discord',   color: '#5865F2', tasks: 'Paste helpful message in HeyGen server' },
    { id: 'dribbble',  name: 'Dribbble',  color: '#EA4C89', tasks: 'Post shot OR like/comment on 5 others' },
    { id: 'behance',   name: 'Behance',   color: '#1769FF', tasks: 'Update 1 project case study' },
    { id: 'instagram', name: 'Instagram', color: '#E1306C', tasks: 'Repurpose LinkedIn post · Post Stories' },
  ]),

  addPlatform(platform) {
    set(st => {
      const a = [...st.platforms, platform];
      save(KEYS.platforms, a);
      return { platforms: a };
    });
  },

  updatePlatform(id, updates) {
    set(st => {
      const a = st.platforms.map(p => p.id === id ? { ...p, ...updates } : p);
      save(KEYS.platforms, a);
      return { platforms: a };
    });
  },

  removePlatform(id) {
    set(st => {
      const a = st.platforms.filter(p => p.id !== id);
      save(KEYS.platforms, a);
      return { platforms: a };
    });
  },

}));

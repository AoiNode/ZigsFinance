import { parseCsv } from "./utils.js";
import { createFinanceSpreadsheet, requestGoogleAccessToken, syncStateToSpreadsheet } from "./googleSheets.js?v=2";

const NAV = [
  ["dashboard", "Beranda"],
  ["transactions", "Transaksi"],
  ["budgets", "Anggaran"],
  ["bills", "Tagihan"],
  ["goals", "Target"],
  ["reports", "Laporan"],
  ["settings", "Pengaturan"]
];
const NAV_ICONS = {
  dashboard: "home",
  accounts: "wallet",
  transactions: "swap",
  budgets: "chart",
  bills: "calendar",
  goals: "target",
  reports: "report",
  settings: "settings"
};
const ICONS = {
  home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>`,
  wallet: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a3 3 0 0 1 3-3h12a1 1 0 1 1 0 2H6a1 1 0 0 0 0 2h14a1 1 0 0 1 1 1v3h-5a3 3 0 1 0 0 6h5v2a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3z"/><path d="M16 14h6v2h-6a1 1 0 1 1 0-2z"/></svg>`,
  swap: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-2.5-2.5L17 3l5 5-5 5-1.5-1.5L18 9H7zM17 17H6l2.5 2.5L7 21l-5-5 5-5 1.5 1.5L6 15h11z"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16v2H2V4h2z"/><path d="M8 10h2v8H8zm5-4h2v12h-2zm5 7h2v5h-2z"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm13 8H4v10h16z"/></svg>`,
  target: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2v2.06A8 8 0 1 1 6.06 11H4a10 10 0 1 0 9-8.94z"/><path d="M21 3v6h-2V6.41l-6.29 6.3-1.42-1.42L17.59 5H15V3z"/></svg>`,
  report: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h10l4 4v16H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1v4h4"/><path d="M8 13h8v2H8zm0 4h8v2H8zm0-8h5v2H8z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m19.14 12.94.86-1.49-1.59-2.75-1.72.34a6.94 6.94 0 0 0-1.2-.7L15.2 6h-3.4l-.29 2.34c-.42.17-.82.4-1.2.7l-1.72-.34-1.59 2.75.86 1.49c-.03.24-.06.48-.06.72s.03.48.06.72l-.86 1.49 1.59 2.75 1.72-.34c.38.3.78.53 1.2.7L11.8 22h3.4l.29-2.34c.42-.17.82-.4 1.2-.7l1.72.34 1.59-2.75-.86-1.49c.03-.24.06-.48.06-.72s-.03-.48-.06-.72zM13.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  income: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6m0 0-4 4m4-4 4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  expense: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v13m0 0-4-4m4 4 4-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 4h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  sync: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8a7 7 0 0 1 12.3-4.6M20 8V3m0 5h-5M20 16a7 7 0 0 1-12.3 4.6M4 16v5m0-5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".25"/><path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 17.25 10.94-10.94 2.75 2.75L5.75 20H3z"/><path d="m14.65 5.6 1.9-1.9a2 2 0 0 1 2.83 0l.92.92a2 2 0 0 1 0 2.83l-1.9 1.9z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5z"/><path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 16.2-3.5-3.5L4 14.2l5 5L20 8.2 18.5 6.7z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  menuCollapse: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  menuExpand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="m10 9 3 3-3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

const DB_KEY = "finance_os_v1";
const SIDEBAR_KEY = "finance_os_sidebar_collapsed";
const REQUIRED_TABS = ["accounts", "transactions", "budgets", "goals", "debts", "settings", "audit_log"];
const state = loadState();
let currentPage = "dashboard";
let pageHistory = ["dashboard"];
let editTxId = null;

let isSidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === "1";
const loadedPages = new Set();
const loadingPages = new Set();
const PAGE_SIZE = 10;
const listPages = { transactions: 1, budgets: 1, bills: 1, goals: 1, auditLog: 1 };
const dashboardHiddenSeries = new Set();
let pendingDeletedTx = null;
let pendingDeleteTimer = null;
let quickTxType = "";
let isBillFormOpen = false;
let isSourceFormOpen = false;
let googleAccessToken = "";
let autoSyncTimer = null;

init();

function init() {
  try {
    renderNav();
    renderBottomNav();
    bindGlobal();
    initRupiahInputs();
    applySidebarState();
    applySetupGateIfNeeded();
    render();
  } catch (err) {
    renderFatalError(err);
  }
}

function defaultState() {
  return {
    profile: { name: "Owner", currency: "IDR" },
    accounts: [{ id: "main-wallet", name: "Dompet Utama", type: "cash", balance: 0, active: true }],
    categories: ["Makan", "Transport", "Tagihan", "Gaji", "Lainnya"],
    transactions: [], budgets: [], bills: [], goals: [], rules: [],
    settings: { googleSpreadsheetId: "", googleSignedOut: false, storageMode: "google", hasPendingSync: false, lastSyncedAt: null },
    auditLog: []
  };
}
function extractSpreadsheetId(url) {
  const match = String(url || "").match(/\/spreadsheets\/d\/([^/]+)/);
  return match ? match[1] : "";
}
function loadState() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}
function normalizeState(raw) {
  const base = defaultState();
  const s = (raw && typeof raw === "object") ? raw : {};
  const oldAccounts = Array.isArray(s.accounts) && s.accounts.length ? s.accounts : base.accounts;
  const mainAccount = { id: "main-wallet", name: "Dompet Utama", type: "cash", balance: oldAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0), active: true };
  const transactions = (Array.isArray(s.transactions) ? s.transactions : base.transactions).map((transaction) => ({ ...transaction, accountId: mainAccount.id }));
  return {
    ...base,
    ...s,
    profile: { ...base.profile, ...(s.profile || {}) },
    settings: {
      ...base.settings,
      googleSpreadsheetId: String(s.settings?.googleSpreadsheetId || extractSpreadsheetId(s.settings?.sheetUrl) || ""),
      googleSignedOut: Boolean(s.settings?.googleSignedOut),
      storageMode: "google",
      hasPendingSync: Boolean(s.settings?.hasPendingSync),
      lastSyncedAt: s.settings?.lastSyncedAt || null
    },
    accounts: [mainAccount],
    categories: Array.isArray(s.categories) && s.categories.length > 0 ? s.categories : base.categories,
    transactions,
    budgets: Array.isArray(s.budgets) ? s.budgets : base.budgets,
    bills: Array.isArray(s.bills) ? s.bills : base.bills,
    goals: Array.isArray(s.goals) ? s.goals : base.goals,
    rules: Array.isArray(s.rules) ? s.rules : base.rules,
    auditLog: Array.isArray(s.auditLog) ? s.auditLog : base.auditLog
  };
}
function saveState(markDirty = true) {
  if (markDirty) state.settings.hasPendingSync = true;
  localStorage.setItem(DB_KEY, JSON.stringify(state));
  if (markDirty && state.settings.storageMode === "google") scheduleAutoSync();
}

function scheduleAutoSync() {
  if (autoSyncTimer) window.clearTimeout(autoSyncTimer);
  autoSyncTimer = window.setTimeout(autoSyncToGoogle, 700);
}

async function autoSyncToGoogle() {
  if (!googleAccessToken || !state.settings.googleSpreadsheetId || !state.settings.hasPendingSync) return;
  try {
    await syncStateToSpreadsheet(googleAccessToken, state.settings.googleSpreadsheetId, state);
    state.settings.lastSyncedAt = new Date().toISOString();
    state.settings.hasPendingSync = false;
    localStorage.setItem(DB_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Sinkron otomatis tertunda:", error?.message || error);
  }
}
function id() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const rnd = Math.random().toString(36).slice(2, 10);
  return `id_${Date.now()}_${rnd}`;
}
function fmt(n) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: state.profile.currency || "IDR", maximumFractionDigits: 0 }).format(Number(n || 0)); }
function parseRupiah(value) { return Number(String(value ?? "").replace(/[^\d-]/g, "")) || 0; }
function formatRupiahInput(input) {
  const raw = String(input.value || "").replace(/\D/g, "");
  input.value = raw ? new Intl.NumberFormat("id-ID").format(Number(raw)) : "";
}
function prepareRupiahInputs(root = document) {
  const names = new Set(["amount", "balance", "limit", "target", "current"]);
  root.querySelectorAll("input").forEach((input) => {
    if (!names.has(input.name) || input.type === "hidden" || input.dataset.rupiah === "1") return;
    input.type = "text";
    input.inputMode = "numeric";
    input.dataset.rupiah = "1";
    if (!input.closest(".amount-field") && !input.closest(".rupiah-control")) {
      const wrap = document.createElement("div");
      wrap.className = "rupiah-control";
      input.parentNode.insertBefore(wrap, input);
      const prefix = document.createElement("b");
      prefix.textContent = "Rp";
      wrap.append(prefix, input);
    }
    formatRupiahInput(input);
  });
}
function initRupiahInputs() {
  document.addEventListener("input", (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.dataset.rupiah === "1") formatRupiahInput(input);
  });
}
function addAudit(action, detail) { state.auditLog.unshift({ id: id(), at: new Date().toISOString(), action, detail }); }

function setPage(next, push = true) {
  if (!next || next === currentPage) return;
  currentPage = next;
  if (Object.hasOwn(listPages, next)) listPages[next] = 1;
  if (push) {
    pageHistory.push(next);
    if (pageHistory.length > 40) pageHistory = pageHistory.slice(-40);
  }
  closeSidebarOnMobile();
  render();
}

function renderNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = NAV.map(([k, l]) => `<button data-page="${k}" title="${l}" aria-label="${l}"><span class="nav-icon">${icon(NAV_ICONS[k] || "home")}</span><span class="nav-label">${l}</span></button>`).join("");
  nav.onclick = (e) => {
    const b = e.target.closest("button[data-page]");
    if (!b) return;
    setPage(b.dataset.page);
  };
}

function renderBottomNav() {
  const bottom = document.getElementById("bottomNav");
  if (!bottom) return;
  bottom.innerHTML = NAV.map(([k, l]) => `<button data-page="${k}" title="${l}" aria-label="${l}"><span class="nav-icon">${icon(NAV_ICONS[k] || "home")}</span></button>`).join("");
}

function bindGlobal() {
  const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
  if (sidebarToggleBtn) sidebarToggleBtn.onclick = () => toggleSidebar();
  const bottom = document.getElementById("bottomNav");
  if (bottom) {
    bottom.onclick = (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.page) setPage(btn.dataset.page);
    };
  }
  document.getElementById("alerts").onclick = (e) => {
    const page = e.target.closest("[data-go-page]")?.dataset.goPage;
    if (page) setPage(page);
  };
  document.getElementById("content").onclick = (e) => {
    const payId = e.target.closest("[data-pay]")?.dataset.pay;
    if (payId) {
      const bill = state.bills.find(b => b.id === payId);
      if (bill) bill.paid = true;
      addAudit("pay_bill", bill?.name);
      saveState();
      showToast("Tagihan ditandai lunas");
      render();
      return;
    }

    const txDelete = e.target.closest("[data-tx-delete]")?.dataset.txDelete;
    if (txDelete) {
      deleteTransaction(txDelete);
      return;
    }
    const txEdit = e.target.closest("[data-tx-edit]")?.dataset.txEdit;
    if (txEdit) {
      openTransactionEditor(txEdit);
      return;
    }

    const genericDelete = e.target.closest("[data-delete]")?.dataset.delete;
    if (genericDelete) {
      const [kind, rid] = genericDelete.split(":");
      deleteRecord(kind, rid);
      return;
    }
    const genericEdit = e.target.closest("[data-edit]")?.dataset.edit;
    if (genericEdit) {
      const [kind, rid] = genericEdit.split(":");
      editRecord(kind, rid);
      return;
    }

    const goPage = e.target.closest("[data-go-page]")?.dataset.goPage;
    if (goPage) {
      setPage(goPage);
      return;
    }

    if (e.target.closest("[data-toggle-bill-form]")) {
      isBillFormOpen = !isBillFormOpen;
      renderBills();
      return;
    }

    if (e.target.closest("[data-toggle-source-form]")) {
      isSourceFormOpen = !isSourceFormOpen;
      renderSettings();
      return;
    }

    const quickType = e.target.closest("[data-quick-type]")?.dataset.quickType;
    if (quickType) {
      quickTxType = quickType;
      if (currentPage === "transactions") renderTransactions();
      else setPage("transactions");
      showToast(quickType === "income" ? "Mode tambah pemasukan" : "Mode tambah pengeluaran");
      return;
    }
    const chartSeries = e.target.closest("[data-chart-series]")?.dataset.chartSeries;
    if (chartSeries) {
      if (dashboardHiddenSeries.has(chartSeries)) dashboardHiddenSeries.delete(chartSeries);
      else dashboardHiddenSeries.add(chartSeries);
      renderDashboard();
      return;
    }
    const pagination = e.target.closest("[data-list-page]");
    if (pagination) {
      const key = pagination.dataset.listPage;
      const page = Number(pagination.dataset.page || 1);
      if (Object.hasOwn(listPages, key) && Number.isInteger(page) && page > 0) {
        listPages[key] = page;
        render();
      }
      return;
    }
    const retryBtn = e.target.closest("[data-retry-render]");
    if (retryBtn) {
      loadedPages.delete(currentPage);
      render();
    }
  };
}

function toggleSidebar() {
  isSidebarCollapsed = !isSidebarCollapsed;
  localStorage.setItem(SIDEBAR_KEY, isSidebarCollapsed ? "1" : "0");
  applySidebarState();
}

function applySidebarState() {
  const appShell = document.querySelector(".app-shell");
  const toggle = document.getElementById("sidebarToggleBtn");
  if (!appShell || !toggle) return;
  appShell.classList.toggle("sidebar-collapsed", isSidebarCollapsed);
  toggle.innerHTML = isSidebarCollapsed ? icon("menuExpand") : icon("menuCollapse");
  toggle.title = isSidebarCollapsed ? "Buka menu" : "Minimalkan menu";
  toggle.setAttribute("aria-label", toggle.title);
}

function renderAlerts() {
  const host = document.getElementById("alerts");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const urgentBills = state.bills
    .filter(b => !b.paid)
    .map(b => {
      const due = new Date(`${b.dueDate}T00:00:00`);
      return { ...b, daysLeft: Math.ceil((due.getTime() - now.getTime()) / 86400000) };
    })
    .filter(b => Number.isFinite(b.daysLeft) && b.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  if (!urgentBills.length) {
    host.innerHTML = "";
    return;
  }
  const overdue = urgentBills.filter(b => b.daysLeft < 0);
  const nearest = urgentBills[0];
  const nearestLabel = nearest.daysLeft < 0 ? `terlambat ${Math.abs(nearest.daysLeft)} hari` : nearest.daysLeft === 0 ? "jatuh tempo hari ini" : `${nearest.daysLeft} hari lagi`;
  const title = overdue.length ? `${overdue.length} tagihan terlambat` : `${urgentBills.length} tagihan segera jatuh tempo`;
  const rows = urgentBills.map(b => {
    const label = b.daysLeft < 0 ? `Terlambat ${Math.abs(b.daysLeft)} hari` : b.daysLeft === 0 ? "Hari ini" : `${b.daysLeft} hari lagi`;
    return `<div class="alert-bill-row"><span><strong>${escapeHtml(b.name)}</strong><small>${label}</small></span><b>${fmt(b.amount)}</b></div>`;
  }).join("");
  host.innerHTML = `<details class="alert-summary ${overdue.length ? "danger" : "warning"}"><summary><span class="alert-symbol">!</span><span class="alert-copy"><strong>${title}</strong><small>Terdekat: ${escapeHtml(nearest.name)} · ${nearestLabel}</small></span><span class="alert-open-label">Lihat</span></summary><div class="alert-detail">${rows}<button class="text-btn" type="button" data-go-page="bills">Kelola semua tagihan →</button></div></details>`;
}

function render() {
  renderAlerts();
  document.getElementById("pageTitle").textContent = NAV.find(n => n[0] === currentPage)?.[1] || "";
  document.querySelectorAll("#nav button[data-page]").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === currentPage));
  document.querySelectorAll("#bottomNav button[data-page]").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === currentPage));
  if (!loadedPages.has(currentPage)) {
    renderPageLoading();
    if (!loadingPages.has(currentPage)) {
      loadingPages.add(currentPage);
      window.setTimeout(() => {
        loadedPages.add(currentPage);
        loadingPages.delete(currentPage);
        if (currentPage) render();
      }, 220);
    }
    return;
  }
  try {
    ({ dashboard: renderDashboard, accounts: renderAccounts, transactions: renderTransactions, budgets: renderBudgets, bills: renderBills, goals: renderGoals, reports: renderReports, settings: renderSettings })[currentPage]();
  } catch (err) {
    renderPageError(err);
  }
}

function renderDashboard() {
  const income = sumTx("income");
  const expense = sumTx("expense");
  const now = new Date();
  const monthlyIncome = state.transactions
    .filter((tx) => {
      if (tx.type !== "income") return false;
      const date = new Date(`${tx.date}T00:00:00`);
      return Number.isFinite(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    })
    .reduce((total, tx) => total + Number(tx.amount || 0), 0);
  const monthlyExpense = state.transactions
    .filter((tx) => {
      if (tx.type !== "expense") return false;
      const date = new Date(`${tx.date}T00:00:00`);
      return Number.isFinite(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    })
    .reduce((total, tx) => total + Number(tx.amount || 0), 0);
  const monthlyCashflow = monthlyIncome - monthlyExpense;
  const netWorth = state.accounts.reduce((a, b) => a + Number(b.balance), 0);
  const savingRate = income > 0 ? ((income - expense) / income) * 100 : 0;
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const allActiveBills = state.bills.filter((b) => !b.paid);
  const totalActiveBills = allActiveBills.length;
  const totalActiveBillsAmount = allActiveBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const dueSoonBills = allActiveBills
    .map((b) => {
      const due = new Date(`${b.dueDate}T00:00:00`);
      const daysLeft = Math.ceil((due.getTime() - todayDate.getTime()) / 86400000);
      return { ...b, daysLeft };
    })
    .filter((b) => Number.isFinite(b.daysLeft) && b.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const dueCount = dueSoonBills.length;
  const dueBillsAmount = dueSoonBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const activeBillText = dueCount
    ? dueSoonBills.slice(0, 3).map((b) => {
      if (b.daysLeft < 0) return `${b.name} (lewat ${Math.abs(b.daysLeft)} hari)`;
      if (b.daysLeft === 0) return `${b.name} (hari ini)`;
      return `${b.name} (${b.daysLeft} hari lagi)`;
    }).join("<br>")
    : "Tidak ada tagihan jatuh tempo dalam 3 hari.";
  const series = [
    { key: "income", label: "Pemasukan bulan ini", value: Math.max(monthlyIncome, 0), colorClass: "masuk" },
    { key: "expense", label: "Pengeluaran bulan ini", value: Math.max(monthlyExpense, 0), colorClass: "keluar" },
    { key: "total", label: "Arus kas bulan ini", value: Math.max(monthlyCashflow, 0), colorClass: "total" }
  ];
  const activeSeries = series.filter((x) => !dashboardHiddenSeries.has(x.key));
  const usedSeries = activeSeries.length ? activeSeries : series;
  const totalChart = Math.max(usedSeries.reduce((sum, row) => sum + row.value, 0), 1);
  const p1 = Math.round((usedSeries[0].value / totalChart) * 100);
  const p2 = usedSeries[1] ? p1 + Math.round((usedSeries[1].value / totalChart) * 100) : p1;
  const chartRows = series.map((row) => {
    const hidden = dashboardHiddenSeries.has(row.key);
    const percent = Math.round((row.value / totalChart) * 100);
    return `<button class="chart-row ${hidden ? "muted" : ""}" type="button" data-chart-series="${row.key}" aria-label="Tampil atau sembunyikan ${row.label}"><span class="dot ${row.colorClass}"></span>${row.label}: ${fmt(row.value)} (${percent}%)</button>`;
  }).join("");
  const recentTx = state.transactions.slice(0, 5);
  const recentRows = recentTx.map(t => `<button class="activity-row" type="button" data-go-page="transactions"><span class="activity-icon ${t.type}">${t.type === "income" ? icon("income") : icon("expense")}</span><span><strong>${escapeHtml(t.category)}</strong><small>${t.date}${t.note ? ` · ${escapeHtml(t.note)}` : ""}</small></span><b class="${t.type}">${t.type === "income" ? "+" : "−"}${fmt(t.amount)}</b></button>`).join("");
  const goalRows = state.goals.slice(0, 3).map(g => { const progress = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0; return `<div class="goal-mini"><div><strong>${escapeHtml(g.name)}</strong><small>${Math.round(progress)}% tercapai</small></div><span>${fmt(g.current)} / ${fmt(g.target)}</span><div class="progress"><span style="width:${progress}%"></span></div></div>`; }).join("");
  setContent(`<section class="dashboard-hero"><div><span class="section-kicker">Saldo Dompet Utama</span><h2>${fmt(netWorth)}</h2><p>${savingRate >= 0 ? "Keuanganmu masih terkendali." : "Pengeluaran sedang lebih besar dari pemasukan."}</p></div></section><div class="metrics modern-metrics">${metric("Pemasukan bulan ini", fmt(monthlyIncome))}${metric("Pengeluaran bulan ini", fmt(monthlyExpense))}${metric("Rasio menabung", `${savingRate.toFixed(1)}%`)}${metric("Tagihan aktif", `${totalActiveBills}`)}</div><section class="dashboard-grid"><div class="card cashflow-card"><div class="card-title-row"><div><span class="section-kicker">Gambaran bulan ini</span><h3>Arus uang</h3></div><button class="text-btn" type="button" data-go-page="reports">Lihat laporan →</button></div><div class="mini-chart"><div class="donut" style="--p1:${p1}%;--p2:${p2}%"></div><div class="chart-legend">${chartRows}</div></div></div><div class="card bill-preview"><div class="card-title-row"><div><span class="section-kicker">Perlu perhatian</span><h3>Tagihan</h3></div><button class="text-btn" type="button" data-go-page="bills">Kelola →</button></div><div class="bill-highlight"><strong>${dueCount ? `${dueCount} segera jatuh tempo` : "Semua aman"}</strong><span>${dueCount ? fmt(dueBillsAmount) : "Tidak ada tagihan dalam 3 hari"}</span></div><p>${activeBillText}</p></div></section><section class="dashboard-grid lower"><div class="card"><div class="card-title-row"><div><span class="section-kicker">Terbaru</span><h3>Aktivitas</h3></div><button class="text-btn" type="button" data-go-page="transactions">Semua →</button></div><div class="activity-list">${recentRows || emptyState("Belum ada transaksi", "Catat pemasukan atau pengeluaran pertamamu.")}</div></div><div class="card"><div class="card-title-row"><div><span class="section-kicker">Progres</span><h3>Target keuangan</h3></div><button class="text-btn" type="button" data-go-page="goals">Kelola →</button></div>${goalRows || emptyState("Belum ada target", "Buat target agar tabungan lebih terarah.")}</div></section><div class="fab-wrap"><button class="fab" id="quickFab" type="button" aria-label="Aksi cepat">${icon("plus")}</button><div class="fab-menu"><button data-quick-type="income" title="Tambah pemasukan" aria-label="Tambah pemasukan">${icon("income")}</button><button data-quick-type="expense" title="Tambah pengeluaran" aria-label="Tambah pengeluaran">${icon("expense")}</button></div></div>`);
  const fab = document.getElementById("quickFab");
  if (fab) fab.onclick = () => document.querySelector(".fab-wrap")?.classList.toggle("open");
}

function renderAccounts() {
  setContent(`<div class="grid grid-2"><form id="accountForm" class="card"><h3>Tambah / Ubah Akun</h3><input type="hidden" name="id"><label>Nama<input name="name" required></label><label>Tipe<select name="type"><option value="cash">Tunai</option><option value="bank">Bank</option><option value="ewallet">Dompet Digital</option><option value="credit">Kartu Kredit</option></select></label><label>Saldo<input name="balance" type="number" value="0"></label><button class="btn">Simpan</button></form><div class="card"><h3>Daftar Akun</h3><div class="table-wrap"><table><thead><tr><th>Nama</th><th>Tipe</th><th>Saldo</th><th>Aksi</th></tr></thead><tbody>${state.accounts.map(a => `<tr><td>${a.name}</td><td>${a.type}</td><td>${fmt(a.balance)}</td><td><button data-edit="accounts:${a.id}" title="Ubah" aria-label="Ubah">${icon("edit")}</button> <button data-delete="accounts:${a.id}" title="Hapus" aria-label="Hapus">${icon("trash")}</button></td></tr>`).join("")}</tbody></table></div></div></div>`);
  document.getElementById("accountForm").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const rid = String(f.get("id") || "");
    const payload = { id: rid || id(), name: String(f.get("name")), type: String(f.get("type")), balance: parseRupiah(f.get("balance")), active: true };
    if (rid) {
      const idx = state.accounts.findIndex(a => a.id === rid);
      if (idx >= 0) state.accounts[idx] = payload;
      addAudit("edit_account", payload.name);
    } else {
      state.accounts.push(payload);
      addAudit("add_account", payload.name);
    }
    saveState();
    render();
  };
}

function renderTransactions() {
  const { items: visibleRows, controls } = paginate(state.transactions, "transactions");
  const rows = visibleRows.map(t => `<tr><td>${t.date}</td><td>${t.type === "income" ? "Pemasukan" : "Pengeluaran"}</td><td>${t.category}</td><td>${fmt(t.amount)}</td><td><button data-tx-edit="${t.id}" title="Ubah" aria-label="Ubah">${icon("edit")}</button><button data-tx-delete="${t.id}" title="Hapus" aria-label="Hapus">${icon("trash")}</button></td></tr>`).join("");
  const history = state.transactions.length === 0 ? emptyState("Belum ada transaksi", "Transaksi yang kamu input akan tampil di sini.") : `<div class="table-wrap"><table><thead><tr><th>Tgl</th><th>Tipe</th><th>Kategori</th><th>Nominal</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div><div class="list-foot"><small>${state.transactions.length} transaksi · 10 per halaman</small>${controls}</div>`;
  setContent(`<section class="transaction-layout"><form id="txForm" class="card tx-entry-card"><div class="tx-card-head"><div><span class="section-kicker">Catat aktivitas</span><h3>Transaksi baru</h3></div><span class="wallet-chip">Dompet Utama</span></div><input type="hidden" name="id" value=""><div class="type-switch"><label><input type="radio" name="type" value="expense" checked><span>− Pengeluaran</span></label><label><input type="radio" name="type" value="income"><span>+ Pemasukan</span></label></div><label class="amount-field"><span>Nominal</span><div><b>Rp</b><input name="amount" type="number" inputmode="numeric" placeholder="0" required></div></label><div class="tx-fields"><label>Tanggal<input name="date" type="date" value="${today()}" required></label><label>Kategori<input name="category" list="cats" placeholder="Pilih atau ketik kategori" required></label></div><datalist id="cats">${state.categories.map(c => `<option value="${c}">`).join("")}</datalist><label>Catatan <small>(opsional)</small><textarea name="note" rows="2" placeholder="Tambahkan keterangan singkat"></textarea></label><div class="tx-actions"><button class="btn tx-save">Simpan transaksi</button><button id="cancelTxBtn" class="btn ghost" type="button">Reset</button></div></form><aside class="card import-card"><div class="tx-card-head"><div><span class="section-kicker">Banyak data?</span><h3>Impor transaksi</h3></div><span class="file-badge">CSV</span></div><p>Masukkan transaksi sekaligus menggunakan file spreadsheet.</p><label class="file-drop" for="csvInput"><strong>Pilih file CSV</strong><small>Ketuk untuk mencari file di perangkat</small></label><input id="csvInput" class="visually-hidden" type="file" accept=".csv"><div class="import-actions"><button id="importBtn" class="btn" type="button">Impor sekarang</button><button id="downloadCsvTemplateBtn" class="btn ghost" type="button">Unduh template</button></div><small>Format lama dengan kolom akun tetap didukung.</small></aside></section><section class="card tx-history-card"><div class="tx-card-head"><div><span class="section-kicker">Aktivitas terakhir</span><h3>Riwayat transaksi</h3></div><span class="count-chip">${state.transactions.length} transaksi</span></div>${history}</section>`);

  const txForm = document.getElementById("txForm");
  if (quickTxType && txForm) {
    const selectedType = txForm.querySelector(`input[name="type"][value="${quickTxType}"]`);
    if (selectedType) selectedType.checked = true;
    quickTxType = "";
  }
  txForm.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const tx = { id: String(f.get("id") || ""), date: String(f.get("date")), type: String(f.get("type")), category: String(f.get("category")), amount: parseRupiah(f.get("amount")), note: String(f.get("note") || ""), accountId: state.accounts[0]?.id || "main-wallet" };
    const isIncome = tx.type === "income";
    const ok = await showConfirmDialog({
      title: isIncome ? "Simpan pemasukan?" : "Simpan pengeluaran?",
      message: `${isIncome ? "Pemasukan" : "Pengeluaran"} ${fmt(tx.amount)} akan ditambahkan.`,
      confirmText: "Ya, simpan",
      danger: false
    });
    if (!ok) return;
    addTransaction(tx);
    e.target.reset();
    e.target.elements.date.value = today();
    render();
  };
  document.getElementById("cancelTxBtn").onclick = () => {
    txForm.reset();
    txForm.elements.date.value = today();
  };
  const csvInput = document.getElementById("csvInput");
  if (csvInput) csvInput.onchange = () => {
    const label = document.querySelector(".file-drop strong");
    if (label) label.textContent = csvInput.files[0]?.name || "Pilih file CSV";
  };
  document.getElementById("importBtn").onclick = importCsv;
  document.getElementById("downloadCsvTemplateBtn").onclick = downloadCsvTemplate;
}

function addTransaction(tx) {
  tx.id = tx.id || id();
  state.transactions.unshift(tx);
  adjustAccountBalance(tx.accountId, tx.type === "income" ? tx.amount : -tx.amount);
  if (!state.categories.includes(tx.category)) state.categories.push(tx.category);
  addAudit("add_transaction", `${tx.type} ${tx.amount}`);
  saveState();
  showToast("Transaksi ditambahkan");
}

function updateTransaction(nextTx) {
  const idx = state.transactions.findIndex(t => t.id === nextTx.id);
  if (idx < 0) return;
  const prev = state.transactions[idx];
  adjustAccountBalance(prev.accountId, prev.type === "income" ? -prev.amount : prev.amount);
  adjustAccountBalance(nextTx.accountId, nextTx.type === "income" ? nextTx.amount : -nextTx.amount);
  state.transactions[idx] = nextTx;
  if (!state.categories.includes(nextTx.category)) state.categories.push(nextTx.category);
  addAudit("edit_transaction", `${nextTx.type} ${nextTx.amount}`);
  saveState();
  showToast("Transaksi diperbarui");
}

async function deleteTransaction(txId) {
  const idx = state.transactions.findIndex(t => t.id === txId);
  if (idx < 0) return;
  const tx = state.transactions[idx];
  const ok = await showConfirmDialog({
    title: "Hapus transaksi?",
    message: `Transaksi ${tx.type === "income" ? "pemasukan" : "pengeluaran"} ${fmt(tx.amount)} akan dihapus.`,
    confirmText: "Ya, hapus",
    danger: true
  });
  if (!ok) return;
  if (pendingDeleteTimer) window.clearTimeout(pendingDeleteTimer);
  pendingDeletedTx = null;
  adjustAccountBalance(tx.accountId, tx.type === "income" ? -tx.amount : tx.amount);
  state.transactions.splice(idx, 1);
  addAudit("delete_transaction", `${tx.type} ${tx.amount}`);
  saveState();
  pendingDeletedTx = { tx, index: idx };
  showActionToast("Transaksi dihapus", "Urungkan", undoDeleteTransaction, 5000);
  pendingDeleteTimer = window.setTimeout(() => { pendingDeletedTx = null; }, 5200);
  render();
}

function undoDeleteTransaction() {
  if (!pendingDeletedTx) return;
  const { tx, index } = pendingDeletedTx;
  const nextIndex = Math.max(0, Math.min(index, state.transactions.length));
  state.transactions.splice(nextIndex, 0, tx);
  adjustAccountBalance(tx.accountId, tx.type === "income" ? tx.amount : -tx.amount);
  addAudit("undo_delete_transaction", `${tx.type} ${tx.amount}`);
  saveState();
  pendingDeletedTx = null;
  if (pendingDeleteTimer) window.clearTimeout(pendingDeleteTimer);
  showToast("Penghapusan dibatalkan");
  render();
}

function fillTransactionForm(txId, targetFormId = "txForm") {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx) return;
  editTxId = txId;
  const form = document.getElementById(targetFormId);
  if (!form) return;
  form.elements.id.value = tx.id;
  form.elements.type.value = tx.type;
  form.elements.date.value = tx.date;
  form.elements.category.value = tx.category;
  form.elements.amount.value = tx.amount;
  form.elements.note.value = tx.note || "";
}
function resetTxEdit() { editTxId = null; }

function adjustAccountBalance(accountId, delta) {
  const acc = findAccount(accountId);
  if (acc) acc.balance = Number(acc.balance || 0) + Number(delta || 0);
}

async function importCsv() {
  const f = document.getElementById("csvInput").files[0];
  if (!f) return;
  const text = await f.text();
  const rows = parseCsv(text);
  const pick = (row, keys) => {
    const key = keys.find((k) => row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "");
    return key ? String(row[key]).trim() : "";
  };
  const toType = (value) => {
    const v = String(value || "").toLowerCase().trim();
    if (v === "income" || v === "pemasukan") return "income";
    if (v === "expense" || v === "pengeluaran") return "expense";
    return "";
  };
  rows.forEach(r => {
    const date = pick(r, ["date", "tanggal"]);
    const type = toType(pick(r, ["type", "tipe"]));
    const category = pick(r, ["category", "kategori"]);
    const amountRaw = pick(r, ["amount", "jumlah"]).replace(/[^\d.-]/g, "");
    const amount = Number(amountRaw);
    const accountName = pick(r, ["account", "akun"]);
    const note = pick(r, ["note", "catatan"]);
    const account = state.accounts.find(a => a.name === accountName) || state.accounts[0];
    if (!date || !type || !category || !Number.isFinite(amount) || amount <= 0) return;
    const duplicate = state.transactions.some(t => t.date === date && t.type === type && t.amount === amount && t.category === category);
    if (duplicate) return;
    addTransaction({ date, type, category, amount, note, accountId: account.id });
  });
  addAudit("import_csv", f.name);
  saveState();
  showToast("Impor CSV selesai");
  render();
}

function downloadCsvTemplate() {
  const template = "\uFEFF" + [
    "tanggal;tipe;kategori;jumlah;akun;catatan",
    "2026-05-01;pengeluaran;Makan & Minum;35000;Kas;Makan siang kantor",
    "2026-05-02;pengeluaran;Transport;18000;E-Wallet;Ojek online ke kantor",
    "2026-05-03;pemasukan;Gaji;5500000;Bank;Gaji bulanan Mei",
    "2026-05-04;pengeluaran;Tagihan;425000;Bank;Bayar listrik"
  ].join("\r\n");
  download("template-transaksi.csv", template, "text/csv");
  showToast("Template CSV diunduh");
}

function renderBudgets() {
  const budgetPage = paginate(state.budgets, "budgets");
  setContent(`<div class="grid grid-2"><form id="budgetForm" class="card"><h3>Tambah / Ubah Anggaran</h3><input type="hidden" name="id"><label>Bulan<input name="month" type="month" required></label><label>Kategori<input name="category" required></label><label>Batas<input name="limit" type="number" required></label><button class="btn">Simpan</button></form><div class="card"><h3>Daftar Anggaran</h3>${budgetPage.controls}${budgetPage.items.map(b => { const spent = state.transactions.filter(t => t.type === "expense" && t.category === b.category && t.date.startsWith(b.month)).reduce((a, t) => a + t.amount, 0); const p = b.limit > 0 ? Math.min(100, (spent / b.limit) * 100) : 0; return `<div><p>${b.month} - ${b.category}: ${fmt(spent)}/${fmt(b.limit)} <button data-edit="budgets:${b.id}" title="Ubah" aria-label="Ubah">${icon("edit")}</button> <button data-delete="budgets:${b.id}" title="Hapus" aria-label="Hapus">${icon("trash")}</button></p><div class="progress"><span style="width:${p}%"></span></div></div>`; }).join("") || emptyState("Belum ada anggaran", "Buat anggaran agar batas belanja bisa dipantau.")}</div></div>`);
  document.getElementById("budgetForm").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const rid = String(f.get("id") || "");
    const payload = { id: rid || id(), month: String(f.get("month")), category: String(f.get("category")), limit: parseRupiah(f.get("limit")) };
    upsertById("budgets", payload, rid ? "edit_budget" : "add_budget", `${payload.month} ${payload.category}`);
    showToast(rid ? "Anggaran diperbarui" : "Anggaran ditambahkan");
    render();
  };
}

function renderBills() {
  const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
  const enriched = state.bills.map(b => { const due = new Date(`${b.dueDate}T00:00:00`); return { ...b, daysLeft: Math.ceil((due.getTime() - todayDate.getTime()) / 86400000) }; }).sort((a,b) => Number(a.paid) - Number(b.paid) || a.daysLeft - b.daysLeft);
  const active = enriched.filter(b => !b.paid);
  const activeTotal = active.reduce((sum,b) => sum + Number(b.amount || 0), 0);
  const urgent = active.filter(b => b.daysLeft <= 3).length;
  const billPage = paginate(enriched, "bills");
  const billCards = billPage.items.map(b => { const status = b.paid ? "paid" : b.daysLeft < 0 ? "late" : b.daysLeft <= 3 ? "soon" : "active"; const statusLabel = b.paid ? "Lunas" : b.daysLeft < 0 ? `Terlambat ${Math.abs(b.daysLeft)} hari` : b.daysLeft === 0 ? "Jatuh tempo hari ini" : `${b.daysLeft} hari lagi`; return `<article class="bill-item ${status}"><div class="bill-main"><span class="bill-icon">${icon("calendar")}</span><div><strong>${escapeHtml(b.name)}</strong><small>${b.dueDate} · ${statusLabel}</small></div></div><div class="bill-amount"><strong>${fmt(b.amount)}</strong><span class="bill-status ${status}">${b.paid ? "Lunas" : statusLabel}</span></div><div class="bill-actions">${b.paid ? "" : `<button class="btn pay-btn" type="button" data-pay="${b.id}">${icon("check")} Tandai lunas</button>`}<button class="icon-btn" type="button" data-edit="bills:${b.id}" title="Ubah">${icon("edit")}</button><button class="icon-btn danger" type="button" data-delete="bills:${b.id}" title="Hapus">${icon("trash")}</button></div></article>`; }).join("");
  const formHtml = isBillFormOpen ? `<form id="billForm" class="card bill-form collapsible-form"><div class="card-title-row"><div><span class="section-kicker">Tagihan baru</span><h3>Tambah tagihan</h3></div><button class="icon-btn" type="button" data-toggle-bill-form="1" aria-label="Tutup">${icon("x")}</button></div><input type="hidden" name="id"><label>Nama tagihan<input name="name" placeholder="Contoh: Internet rumah" required></label><label class="amount-field"><span>Nominal</span><div><b>Rp</b><input name="amount" type="number" inputmode="numeric" placeholder="0" required></div></label><label>Jatuh tempo<input name="dueDate" type="date" required></label><input type="hidden" name="paid" value="false"><div class="bill-form-actions"><button class="btn bill-save">Simpan tagihan</button><button class="btn ghost" type="button" data-toggle-bill-form="1">Batal</button></div></form>` : "";
  setContent(`<section class="bill-summary"><div><span class="section-kicker">Belum dibayar</span><h2>${fmt(activeTotal)}</h2><p>${active.length} tagihan aktif</p></div><div class="bill-summary-meta"><span><b>${urgent}</b> perlu perhatian</span><span><b>${enriched.filter(b=>b.paid).length}</b> sudah lunas</span></div></section><div class="bill-toolbar"><div><span class="section-kicker">Pembayaran rutin</span><strong>Kelola tagihanmu di satu tempat</strong></div><button class="btn add-bill-btn" type="button" data-toggle-bill-form="1">${isBillFormOpen ? icon("x") : icon("plus")} ${isBillFormOpen ? "Tutup" : "Tambah tagihan"}</button></div>${formHtml}<section class="card bill-list-card full"><div class="card-title-row"><div><span class="section-kicker">Jadwal pembayaran</span><h3>Daftar tagihan</h3></div><span class="count-chip">${state.bills.length} total</span></div><div class="bill-list">${billCards || emptyState("Belum ada tagihan", "Tekan Tambah tagihan untuk membuat tagihan pertamamu.")}</div>${billPage.controls}</section>`);
  const billForm = document.getElementById("billForm");
  if (!billForm) return;
  billForm.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const rid = String(f.get("id") || "");
    const payload = { id: rid || id(), name: String(f.get("name")), amount: parseRupiah(f.get("amount")), dueDate: String(f.get("dueDate")), paid: String(f.get("paid")) === "true" };
    upsertById("bills", payload, rid ? "edit_bill" : "add_bill", payload.name);
    showToast(rid ? "Tagihan diperbarui" : "Tagihan ditambahkan");
    isBillFormOpen = false;
    render();
  };
}

function renderGoals() {
  const goalPage = paginate(state.goals, "goals");
  setContent(`<div class="grid grid-2"><form id="goalForm" class="card"><h3>Tambah / Ubah Target</h3><input type="hidden" name="id"><label>Nama Target<input name="name" required></label><label>Target<input name="target" type="number" required></label><label>Saat Ini<input name="current" type="number" value="0" required></label><label>Batas Waktu<input name="deadline" type="date" required></label><button class="btn">Simpan</button></form><div class="card"><h3>Daftar Target</h3>${goalPage.controls}${goalPage.items.map(g => { const p = Math.min(100, (g.current / g.target) * 100); return `<div><p>${g.name} (${g.deadline}): ${fmt(g.current)}/${fmt(g.target)} <button data-edit="goals:${g.id}" title="Ubah" aria-label="Ubah">${icon("edit")}</button> <button data-delete="goals:${g.id}" title="Hapus" aria-label="Hapus">${icon("trash")}</button></p><div class="progress"><span style="width:${p}%"></span></div></div>`; }).join("") || emptyState("Belum ada target", "Tambahkan target untuk memantau pencapaian.")}</div></div>`);
  document.getElementById("goalForm").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const rid = String(f.get("id") || "");
    const payload = { id: rid || id(), name: String(f.get("name")), target: parseRupiah(f.get("target")), current: parseRupiah(f.get("current")), deadline: String(f.get("deadline")) };
    upsertById("goals", payload, rid ? "edit_goal" : "add_goal", payload.name);
    showToast(rid ? "Target diperbarui" : "Target ditambahkan");
    render();
  };
}

function renderReports() {
  const byCategory = {};
  state.transactions.filter(t => t.type === "expense").forEach(t => byCategory[t.category] = (byCategory[t.category] || 0) + t.amount);
  const rows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const totalIncome = sumTx("income");
  const totalExpense = sumTx("expense");
  setContent(`<div class="metrics report-metrics">${metric("Total pemasukan", fmt(totalIncome))}${metric("Total pengeluaran", fmt(totalExpense))}</div><div class="card"><h3>Pengeluaran Teratas per Kategori</h3>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Kategori</th><th>Total</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${fmt(r[1])}</td></tr>`).join("")}</tbody></table></div>` : emptyState("Belum ada data laporan", "Masukkan transaksi agar laporan kategori muncul.")}</div><div class="card"><h3>Ekspor / Cadangan</h3><button id="exportJson" class="btn">Ekspor JSON</button><button id="exportCsv" class="btn">Ekspor CSV</button></div>`);
  document.getElementById("exportJson").onclick = () => download("backup-finance.json", JSON.stringify(state, null, 2), "application/json");
  document.getElementById("exportCsv").onclick = () => {
    const header = "date,type,category,amount,account,note";
    const body = state.transactions.map(t => `${t.date},${t.type},${t.category},${t.amount},${findAccount(t.accountId)?.name || ""},\"${(t.note || "").replaceAll('"', '""')}\"`).join("\n");
    download("transactions.csv", `${header}\n${body}`, "text/csv");
  };
}

function renderSettings() {
  const s = state.settings;
  const auditPage = paginate(state.auditLog, "auditLog");
  const lastSyncedLabel = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString("id-ID") : "Belum pernah";
  const auditRows = state.auditLog.length ? auditPage.items.map(l => `<div class="audit-row"><span class="audit-dot"></span><div><strong>${escapeHtml(l.action)}</strong><small>${new Date(l.at).toLocaleString("id-ID")}</small><p>${escapeHtml(l.detail || "Tanpa detail")}</p></div></div>`).join("") : emptyState("Belum ada aktivitas", "Aktivitas terbaru akan tercatat otomatis.");
  setContent(`<div class="settings-layout"><section class="settings-account-card card"><div class="settings-account-icon"><span class="google-g">G</span></div><div class="settings-account-copy"><span class="section-kicker">Akun Google</span><h3>Terhubung ke Google</h3><p>Data keuangan tersimpan otomatis di Spreadsheet pribadi milikmu.</p></div><button id="logoutGoogleBtn" class="btn logout-btn" type="button">Keluar</button></section><section class="card settings-sync-card"><div class="card-title-row"><div><span class="section-kicker">Penyimpanan</span><h3>Status sinkron</h3></div><span class="bill-status ${s.hasPendingSync ? "soon" : "paid"}">${s.hasPendingSync ? "Menunggu" : "Tersinkron"}</span></div><div class="sync-info-row"><span>Sinkron terakhir</span><strong>${lastSyncedLabel}</strong></div><p class="sync-caption">${s.hasPendingSync ? "Perubahan akan dikirim otomatis saat koneksi Google tersedia." : "Data lokal dan Google Spreadsheet sudah sama."}</p></section><section class="card settings-audit-card"><div class="card-title-row"><div><span class="section-kicker">Keamanan</span><h3>Jejak aktivitas</h3></div><span class="count-chip">${state.auditLog.length} aktivitas</span></div><div class="audit-list">${auditRows}</div>${auditPage.controls}</section></div>`);
  document.getElementById("logoutGoogleBtn").onclick = logoutGoogle;
}

function applySetupGateIfNeeded() {
  const needsSetup = state.settings.googleSignedOut || !state.settings.googleSpreadsheetId;
  const gate = document.getElementById("setupGate");
  if (!needsSetup) {
    gate.classList.add("hidden");
    return;
  }
  gate.classList.remove("hidden");
  gate.innerHTML = `<section class="setup-card google-setup login-gate"><img class="login-logo" src="./icons/icon-192.png?v=2" alt="Logo Zigs.fi"><h2>Masuk ke Zigs.fi</h2><p>Catat keuangan dan simpan otomatis ke Google Sheets milikmu.</p><button id="connectGoogleBtn" class="btn google-connect" type="button"><span class="google-g">G</span> Lanjutkan dengan Google</button><small id="setupState" class="setup-status">Data tetap tersimpan di akun Google milikmu.</small></section>`;
  document.getElementById("connectGoogleBtn").onclick = () => connectGoogleStorage(!state.settings.googleSpreadsheetId);
}

async function logoutGoogle() {
  const ok = await showConfirmDialog({ title: "Keluar dari Zigs.fi?", message: "Data lokal dan Spreadsheet tidak akan dihapus.", confirmText: "Ya, keluar", danger: false });
  if (!ok) return;
  googleAccessToken = "";
  state.settings.googleSignedOut = true;
  addAudit("logout_google", "success");
  localStorage.setItem(DB_KEY, JSON.stringify(state));
  applySetupGateIfNeeded();
}

async function connectGoogleStorage(createNew = false) {
  const message = document.getElementById("setupState");
  const button = document.getElementById("connectGoogleBtn");
  if (button) button.disabled = true;
  if (message) message.textContent = "Membuka login Google...";
  try {
    const accessToken = await requestGoogleAccessToken("consent");
    googleAccessToken = accessToken;
    let spreadsheetId = state.settings.googleSpreadsheetId;
    if (createNew || !spreadsheetId) {
      if (message) message.textContent = "Membuat Spreadsheet Zigs.fi...";
      const spreadsheet = await createFinanceSpreadsheet(accessToken);
      spreadsheetId = spreadsheet.spreadsheetId;
    }
    state.settings.storageMode = "google";
    state.settings.googleSignedOut = false;
    state.settings.googleSpreadsheetId = spreadsheetId;
    addAudit("connect_google_sheets", spreadsheetId);
    if (message) message.textContent = "Mengirim data awal...";
    await syncStateToSpreadsheet(accessToken, spreadsheetId, state);
    state.settings.lastSyncedAt = new Date().toISOString();
    state.settings.hasPendingSync = false;
    saveState(false);
    document.getElementById("setupGate")?.classList.add("hidden");
    showToast("Google Spreadsheet berhasil dibuat dan terhubung");
    render();
  } catch (error) {
    if (message) message.textContent = error.message || "Gagal menghubungkan Google";
    showToast(error.message || "Gagal menghubungkan Google");
  } finally {
    if (button) button.disabled = false;
  }
}


function renderPageLoading() {
  setContent(`<div class="card"><div class="skeleton-line w-40"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line w-70"></div></div>`);
}

function renderPageError(err) {
  const message = err?.message || "Terjadi galat tidak terduga.";
  setContent(`<div class="card"><h3>Terjadi galat halaman</h3><p>${escapeHtml(message)}</p><button class="btn" type="button" data-retry-render="1">Coba lagi</button></div>`);
}


function upsertById(kind, payload, action, detail) {
  const list = state[kind];
  const idx = list.findIndex(x => x.id === payload.id);
  if (idx >= 0) list[idx] = payload; else list.unshift(payload);
  addAudit(action, detail);
  saveState();
}

async function deleteRecord(kind, rid) {
  const list = state[kind];
  if (!Array.isArray(list)) return;
  const idx = list.findIndex(x => x.id === rid);
  if (idx < 0) return;
  const name = list[idx].name || list[idx].category || rid;
  const ok = await showConfirmDialog({
    title: "Hapus data?",
    message: `${name} akan dihapus permanen dari ${kind}.`,
    confirmText: "Ya, hapus",
    danger: true
  });
  if (!ok) return;
  list.splice(idx, 1);
  addAudit(`delete_${kind.slice(0, -1)}`, name);
  saveState();
  showToast("Data dihapus");
  render();
}

function editRecord(kind, rid) {
  const row = (state[kind] || []).find(x => x.id === rid);
  if (!row) return;
  openRecordEditor(kind, row);
}

function openRecordEditor(kind, row) {
  const configMap = {
    accounts: {
      title: "Edit Akun",
      confirmTitle: "Simpan perubahan akun?",
      confirmMessage: (payload) => `Perubahan akun ${payload.name} akan disimpan.`,
      detail: (payload) => payload.name,
      action: "edit_account",
      fields: [
        { name: "name", label: "Nama", type: "text", required: true },
        { name: "type", label: "Tipe", type: "select", options: [
          ["cash", "Tunai"], ["bank", "Bank"], ["ewallet", "Dompet Digital"], ["credit", "Kartu Kredit"]
        ] },
        { name: "balance", label: "Saldo", type: "number", required: true }
      ]
    },
    budgets: {
      title: "Edit Anggaran",
      confirmTitle: "Simpan perubahan anggaran?",
      confirmMessage: (payload) => `Perubahan ${payload.month} - ${payload.category} akan disimpan.`,
      detail: (payload) => `${payload.month} ${payload.category}`,
      action: "edit_budget",
      fields: [
        { name: "month", label: "Bulan", type: "month", required: true },
        { name: "category", label: "Kategori", type: "text", required: true },
        { name: "limit", label: "Batas", type: "number", required: true }
      ]
    },
    bills: {
      title: "Edit Tagihan",
      confirmTitle: "Simpan perubahan tagihan?",
      confirmMessage: (payload) => `Perubahan tagihan ${payload.name} akan disimpan.`,
      detail: (payload) => payload.name,
      action: "edit_bill",
      fields: [
        { name: "name", label: "Nama", type: "text", required: true },
        { name: "amount", label: "Nominal", type: "number", required: true },
        { name: "dueDate", label: "Jatuh Tempo", type: "date", required: true },
        { name: "paid", label: "Status", type: "select", options: [["false", "Belum"], ["true", "Lunas"]] }
      ]
    },
    goals: {
      title: "Edit Target",
      confirmTitle: "Simpan perubahan target?",
      confirmMessage: (payload) => `Perubahan target ${payload.name} akan disimpan.`,
      detail: (payload) => payload.name,
      action: "edit_goal",
      fields: [
        { name: "name", label: "Nama Target", type: "text", required: true },
        { name: "target", label: "Target", type: "number", required: true },
        { name: "current", label: "Saat Ini", type: "number", required: true },
        { name: "deadline", label: "Batas Waktu", type: "date", required: true }
      ]
    }
  };
  const config = configMap[kind];
  if (!config) return;
  const modalId = `recordEditModal-${kind}`;
  const oldModal = document.getElementById(modalId);
  if (oldModal) oldModal.remove();
  const fieldsHtml = config.fields.map((f) => {
    if (f.type === "select") {
      return `<label>${f.label}<select name="${f.name}" ${f.required ? "required" : ""}>${(f.options || []).map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join("")}</select></label>`;
    }
    return `<label>${f.label}<input name="${f.name}" type="${f.type}" ${f.required ? "required" : ""}></label>`;
  }).join("");
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = modalId;
  modal.innerHTML = `<div class="modal-card"><div class="modal-head"><h3>${escapeHtml(config.title)}</h3><button class="modal-close" type="button" aria-label="Tutup">${icon("x")}</button></div><form id="recordEditForm"><input type="hidden" name="id">${fieldsHtml}<div class="row"><button class="btn" type="submit">Simpan Perubahan</button><button class="btn ghost" type="button" data-close-modal="1">Batal</button></div></form></div>`;
  document.body.appendChild(modal);
  const form = modal.querySelector("#recordEditForm");
  form.elements.id.value = String(row.id || "");
  config.fields.forEach((f) => {
    if (!form.elements[f.name]) return;
    form.elements[f.name].value = String(row[f.name] ?? "");
  });
  const close = () => modal.remove();
  modal.querySelector(".modal-close").onclick = close;
  modal.querySelector("[data-close-modal='1']").onclick = close;
  modal.onclick = (e) => {
    if (e.target === modal) close();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = { id: String(fd.get("id") || "") };
    config.fields.forEach((f) => {
      const rawValue = fd.get(f.name);
      if (f.type === "number") payload[f.name] = ["amount", "balance", "limit", "target", "current"].includes(f.name) ? parseRupiah(rawValue) : Number(rawValue);
      else if (kind === "bills" && f.name === "paid") payload[f.name] = String(rawValue) === "true";
      else payload[f.name] = String(rawValue || "");
    });
    const ok = await showConfirmDialog({
      title: config.confirmTitle,
      message: config.confirmMessage(payload),
      confirmText: "Ya, simpan",
      danger: false
    });
    if (!ok) return;
    upsertById(kind, payload, config.action, config.detail(payload));
    showToast(`${config.title.replace("Edit ", "")} diperbarui`);
    close();
    render();
  };
}

function openTransactionEditor(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx) return;
  const modalId = "txEditModal";
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = modalId;
  modal.innerHTML = `<div class="modal-card"><div class="modal-head"><h3>Edit Transaksi</h3><button class="modal-close" type="button" aria-label="Tutup">${icon("x")}</button></div><form id="txEditForm"><input type="hidden" name="id"><label>Tipe<select name="type"><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select></label><label>Tanggal<input name="date" type="date" required></label><label>Kategori<input name="category" list="cats-edit" required></label><datalist id="cats-edit">${state.categories.map(c => `<option value="${c}">`)}</datalist><label>Nominal<input name="amount" type="number" required></label><label>Catatan<textarea name="note"></textarea></label><div class="row"><button class="btn" type="submit">Simpan Perubahan</button><button class="btn ghost" type="button" data-close-modal="1">Batal</button></div></form></div>`;
  document.body.appendChild(modal);
  fillTransactionForm(txId, "txEditForm");
  const close = () => modal.remove();
  modal.querySelector(".modal-close").onclick = close;
  modal.querySelector("[data-close-modal='1']").onclick = close;
  modal.onclick = (e) => {
    if (e.target === modal) close();
  };
  modal.querySelector("#txEditForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const txNext = { id: String(f.get("id") || ""), date: String(f.get("date")), type: String(f.get("type")), category: String(f.get("category")), amount: parseRupiah(f.get("amount")), note: String(f.get("note") || ""), accountId: state.accounts[0]?.id || "main-wallet" };
    const ok = await showConfirmDialog({
      title: "Simpan perubahan transaksi?",
      message: `Perubahan untuk ${txNext.type === "income" ? "pemasukan" : "pengeluaran"} ${fmt(txNext.amount)} akan disimpan.`,
      confirmText: "Ya, simpan",
      danger: false
    });
    if (!ok) return;
    updateTransaction(txNext);
    close();
    render();
  };
}

function closeSidebarOnMobile() {
  if (window.innerWidth <= 980) document.querySelector(".sidebar").classList.remove("open");
}
function renderFatalError(err) {
  const content = document.getElementById("content");
  const title = document.getElementById("pageTitle");
  if (title) title.textContent = "Galat";
  if (content) {
    content.innerHTML = `<div class="card"><h3>Aplikasi gagal dimuat</h3><p>Terjadi galat saat inisialisasi. Coba muat ulang halaman.</p><pre>${escapeHtml(err?.message || "Galat tidak dikenal")}</pre></div>`;
  }
}

function findAccount(i) { return state.accounts.find(a => a.id === i); }
function sumTx(t) { return state.transactions.filter(x => x.type === t).reduce((a, x) => a + Number(x.amount), 0); }
function paginate(items, key) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(listPages[key] || 1)), totalPages);
  listPages[key] = page;
  const start = (page - 1) * PAGE_SIZE;
  const controls = items.length > PAGE_SIZE ? `<nav class="pagination" aria-label="Navigasi daftar"><button class="btn ghost" type="button" data-list-page="${key}" data-page="${page - 1}" ${page === 1 ? "disabled" : ""}>← Sebelumnya</button><span>Halaman ${page} dari ${totalPages}</span><button class="btn ghost" type="button" data-list-page="${key}" data-page="${page + 1}" ${page === totalPages ? "disabled" : ""}>Berikutnya →</button></nav>` : "";
  return { items: items.slice(start, start + PAGE_SIZE), controls };
}
function metric(k, v) { return `<div class="metric"><small>${k}</small><h3>${v}</h3></div>`; }
function setContent(h) { const content = document.getElementById("content"); content.innerHTML = `<div class="grid">${h}</div>`; prepareRupiahInputs(content); }
function icon(name) { return ICONS[name] || ICONS.settings; }
function showToast(message) {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = String(message || "");
  host.appendChild(toast);
  window.setTimeout(() => toast.classList.add("show"), 10);
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  }, 2400);
}
function showActionToast(message, actionLabel, onAction, duration = 3200) {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = "toast toast-action";
  toast.innerHTML = `<span>${escapeHtml(message)}</span><button type="button">${escapeHtml(actionLabel)}</button>`;
  const actionBtn = toast.querySelector("button");
  actionBtn.onclick = () => {
    onAction?.();
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 180);
  };
  host.appendChild(toast);
  window.setTimeout(() => toast.classList.add("show"), 10);
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  }, duration);
}
function showConfirmDialog({ title, message, confirmText = "Lanjutkan", cancelText = "Batal", danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    dialog.className = "confirm-backdrop";
    dialog.innerHTML = `<div class="confirm-card"><h3>${escapeHtml(title || "Konfirmasi")}</h3><p>${escapeHtml(message || "")}</p><div class="confirm-actions"><button type="button" class="btn ghost" data-cancel="1">${escapeHtml(cancelText)}</button><button type="button" class="btn ${danger ? "btn-danger" : ""}" data-confirm="1">${escapeHtml(confirmText)}</button></div></div>`;
    document.body.appendChild(dialog);
    const close = (result) => {
      dialog.remove();
      resolve(result);
    };
    dialog.querySelector("[data-cancel='1']").onclick = () => close(false);
    dialog.querySelector("[data-confirm='1']").onclick = () => close(true);
    dialog.onclick = (e) => {
      if (e.target === dialog) close(false);
    };
  });
}
function emptyState(title, description) {
  return `<div class="empty-state"><p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(description)}</p></div>`;
}
function escapeHtml(s) { return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function download(name, content, type) { const blob = new Blob([content], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
function today() { return new Date().toISOString().slice(0, 10); }





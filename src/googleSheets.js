export const GOOGLE_CLIENT_ID = "1080886660072-p6m6obifssalemf9ruefv2egid0fqlsd.apps.googleusercontent.com";
export const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
export const SHEET_TABS = ["accounts", "transactions", "budgets", "goals", "debts", "settings", "audit_log"];

export function sheetUrl(id) {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

export function stateToSheetValues(state) {
  const settings = Object.entries(state.settings || {}).map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(value) : String(value ?? "")]);
  return {
    accounts: [["id", "name", "type", "balance", "active"], ...(state.accounts || []).map(x => [x.id, x.name, x.type, x.balance, x.active])],
    transactions: [["id", "date", "type", "category", "amount", "accountId", "note"], ...(state.transactions || []).map(x => [x.id, x.date, x.type, x.category, x.amount, x.accountId, x.note || ""])],
    budgets: [["id", "month", "category", "limit"], ...(state.budgets || []).map(x => [x.id, x.month, x.category, x.limit])],
    goals: [["id", "name", "target", "current", "deadline"], ...(state.goals || []).map(x => [x.id, x.name, x.target, x.current, x.deadline])],
    debts: [["id", "name", "amount", "dueDate", "paid"], ...(state.bills || []).map(x => [x.id, x.name, x.amount, x.dueDate, x.paid])],
    settings: [["key", "value"], ...settings],
    audit_log: [["id", "at", "action", "detail"], ...(state.auditLog || []).map(x => [x.id, x.at, x.action, x.detail || ""])]
  };
}

export async function googleApi(path, accessToken, options = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Google API gagal (${response.status})`);
  return data;
}

export async function createFinanceSpreadsheet(accessToken) {
  return googleApi("spreadsheets", accessToken, {
    method: "POST",
    body: JSON.stringify({
      properties: { title: "Zigs.fi — Data Keuangan", locale: "id_ID", timeZone: "Asia/Jakarta" },
      sheets: SHEET_TABS.map(title => ({ properties: { title } }))
    })
  });
}

export async function syncStateToSpreadsheet(accessToken, spreadsheetId, state) {
  const values = stateToSheetValues(state);
  await googleApi(`spreadsheets/${spreadsheetId}/values:batchClear`, accessToken, {
    method: "POST",
    body: JSON.stringify({ ranges: SHEET_TABS.map(tab => `${tab}!A:Z`) })
  });
  return googleApi(`spreadsheets/${spreadsheetId}/values:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: SHEET_TABS.map(tab => ({ range: `${tab}!A1`, majorDimension: "ROWS", values: values[tab] }))
    })
  });
}

export function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity]');
    if (existing) { existing.addEventListener("load", resolve, { once: true }); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "1";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Google Identity gagal dimuat"));
    document.head.appendChild(script);
  });
}

export async function requestGoogleAccessToken(prompt = "consent") {
  await loadGoogleIdentityScript();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: response => response.error ? reject(new Error(response.error_description || response.error)) : resolve(response.access_token),
      error_callback: error => reject(new Error(error?.message || "Login Google dibatalkan"))
    });
    client.requestAccessToken({ prompt });
  });
}

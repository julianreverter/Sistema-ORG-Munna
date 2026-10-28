export type AccountMovement = { key: string; date: string; detail: string; debit: number; credit: number; note: string };
export const accountMoney = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value);
export const accountDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
export const accountDate = (value: string) => accountDay(value).split("-").reverse().join("/");
export function accountDefaultRange(now = new Date()) {
  const to = accountDay(now.toISOString());
  const [year, month, day] = to.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 3, 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return { from: start.toISOString().slice(0, 10), to };
}
const cents = (amount: number) => Math.round(amount * 100);
export function summarizeAccount(movements: AccountMovement[], from: string, to: string) {
  if (!from || !to || from > to) return null;
  const sorted = [...movements].sort((a, b) => accountDay(a.date).localeCompare(accountDay(b.date)) || a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  const openingCents = sorted.filter((row) => accountDay(row.date) < from).reduce((sum, row) => sum + cents(row.debit) - cents(row.credit), 0);
  let running = openingCents;
  const rows = sorted.filter((row) => accountDay(row.date) >= from && accountDay(row.date) <= to).map((row) => {
    running += cents(row.debit) - cents(row.credit);
    return { ...row, balance: running / 100 };
  });
  const debits = rows.reduce((sum, row) => sum + cents(row.debit), 0) / 100;
  const credits = rows.reduce((sum, row) => sum + cents(row.credit), 0) / 100;
  return { opening: openingCents / 100, closing: running / 100, debits, credits, rows };
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
export function customerStatementHtml(clientName: string, from: string, to: string, movements: AccountMovement[]) {
  const summary = summarizeAccount(movements, from, to);
  if (!summary) throw new Error("Revisá las fechas del resumen.");
  const balanceLabel = summary.closing > 0 ? "Saldo deudor" : summary.closing < 0 ? "Saldo a favor del cliente" : "Saldo final";
  // Only explicitly selected customer-facing fields are exported. Notes and internal costs stay private.
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Resumen de cuenta corriente</title><style>@page{size:A4;margin:16mm}body{font:12px Arial,sans-serif;color:#30222a}h1{font-size:24px;margin:0 0 8px}h2{font-size:18px}.brand{color:#a94068;font-weight:bold;letter-spacing:2px}table{width:100%;border-collapse:collapse;margin:20px 0}thead{display:table-header-group}th,td{padding:9px 5px;border-bottom:1px solid #ddd;text-align:left}th{background:#f8edf2}.number{text-align:right;white-space:nowrap}tr{break-inside:avoid}.total{padding:15px;border:1px solid #ccc;font-size:16px}.muted{color:#666}button{padding:10px 16px;margin-bottom:20px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Imprimir / Guardar como PDF</button><p class="brand">MÜNNA</p><h1>Resumen de cuenta corriente</h1><h2>${escapeHtml(clientName)}</h2><p>Período: ${accountDate(from)} al ${accountDate(to)}</p><p><b>Saldo anterior al ${accountDate(from)}: ${accountMoney(summary.opening)}</b></p><table><thead><tr><th>Fecha</th><th>Movimiento</th><th class="number">Debe</th><th class="number">Haber</th><th class="number">Saldo</th></tr></thead><tbody>${summary.rows.map((row) => `<tr><td>${accountDate(row.date)}</td><td>${escapeHtml(row.detail)}</td><td class="number">${row.debit ? accountMoney(row.debit) : "—"}</td><td class="number">${row.credit ? accountMoney(row.credit) : "—"}</td><td class="number">${accountMoney(row.balance)}</td></tr>`).join("") || '<tr><td colspan="5">Sin movimientos en este período.</td></tr>'}</tbody></table><p>Total debe: ${accountMoney(summary.debits)} · Total haber: ${accountMoney(summary.credits)}</p><p class="total"><b>${balanceLabel} al ${accountDate(to)}: ${accountMoney(Math.abs(summary.closing))}</b></p><p class="muted">Los importes positivos representan deuda del cliente. Moneda: pesos argentinos.</p></body></html>`;
}

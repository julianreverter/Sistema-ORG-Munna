export type IssuedCheck = {
  id: string; number: string; bank: string; beneficiary: string; amount: number;
  issued_on: string; due_on: string; status: "pending" | "debited" | "cancelled";
  debited_on: string | null; notes: string; updated_at: string;
};

export const argentinaDay = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

export function validCheckDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number(value.slice(0, 4)) >= 1900
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

// Accept Argentine money (1.234,56) and ungrouped decimal input (1234.56).
export function checkAmount(value: unknown): number {
  const raw = String(value ?? "").trim().replace(/^\$\s*/, "");
  let normalized = raw;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)) normalized = raw.replaceAll(".", "").replace(",", ".");
  else if (/^\d+(,\d{1,2})?$/.test(raw)) normalized = raw.replace(",", ".");
  else if (!/^\d+\.\d{1,2}$/.test(raw)) return NaN;
  const amount = Number(normalized);
  return amount > 0 && amount <= 999999999999.99 ? Math.round(amount * 100) / 100 : NaN;
}

export function checkInputError(input: Record<string, unknown>): string | null {
  for (const key of ["number", "bank", "beneficiary"]) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > 200) return "Completá número, banco y beneficiario (máximo 200 caracteres).";
  }
  if (!Number.isFinite(checkAmount(input.amount))) return "Ingresá un importe mayor a cero con hasta dos decimales.";
  if (!validCheckDate(input.issued_on) || !validCheckDate(input.due_on)) return "Completá fechas válidas de emisión y vencimiento.";
  if (input.due_on < input.issued_on) return "El vencimiento no puede ser anterior a la emisión.";
  if (!["pending", "debited", "cancelled"].includes(String(input.status))) return "Estado de cheque inválido.";
  if (input.status === "debited" && (!validCheckDate(input.debited_on) || input.debited_on < input.issued_on || input.debited_on > argentinaDay())) return "Ingresá la fecha real de débito, entre la emisión y hoy.";
  if (typeof input.notes !== "string" || input.notes.length > 2000) return "Las observaciones admiten hasta 2000 caracteres.";
  return null;
}

export function summarizeChecks(rows: IssuedCheck[], month: string) {
  const active = rows.filter(row => row.status !== "cancelled");
  const cents = (items: IssuedCheck[]) => items.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100;
  const due = active.filter(row => row.due_on.startsWith(month));
  const pending = due.filter(row => row.status === "pending");
  const previous = active.filter(row => row.status === "pending" && row.due_on < `${month}-01`);
  return {
    issued: cents(active.filter(row => row.issued_on.startsWith(month))),
    due: cents(due), paid: cents(due.filter(row => row.status === "debited")),
    pending: cents(pending), previous: cents(previous), totalPending: cents([...pending, ...previous]),
  };
}

// Calendar week in Argentina, Monday through Sunday. Keep all overdue pending
// checks, even when their due date belongs to an earlier month or year.
export function weeklyChecks(rows: IssuedCheck[], day = argentinaDay()) {
  const current = new Date(`${day}T12:00:00Z`);
  const start = new Date(current);
  start.setUTCDate(current.getUTCDate() - (current.getUTCDay() + 6) % 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const endDay = end.toISOString().slice(0, 10);
  const checks = rows.filter(row => row.status === "pending" && row.due_on <= endDay);
  return {
    start: start.toISOString().slice(0, 10), end: endDay, checks,
    total: checks.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100,
  };
}

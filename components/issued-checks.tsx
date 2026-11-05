"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { argentinaDay, checkCalendarDays, checkInputError, offsetCheckMonth, summarizeChecks, weeklyChecks, type IssuedCheck } from "@/lib/issued-checks";

const money = (amount: number) => amount.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const date = (day: string | null) => day ? day.split("-").reverse().join("/") : "—";
const statusLabel = { pending: "Pendiente", debited: "Debitado", cancelled: "Anulado" };
const selectClass = "h-10 w-full rounded-md border bg-white px-3 text-sm font-normal";
type Draft = Omit<IssuedCheck, "id" | "amount" | "updated_at"> & { id?: string; amount: string; updated_at?: string };
const newDraft = (): Draft => ({ number: "", bank: "", beneficiary: "", amount: "", issued_on: argentinaDay(), due_on: "", status: "pending", debited_on: null, notes: "" });
async function fetchChecks(): Promise<IssuedCheck[]> {
  const response = await fetch("/api/issued-checks", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.checks;
}

const monthTitle = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

function CheckCalendar({ rows, month, today, selectedDay, onMonthChange, onSelectDay, onNewCheck }: {
  rows: IssuedCheck[]; month: string; today: string; selectedDay: string | null;
  onMonthChange: (month: string) => void; onSelectDay: (day: string) => void; onNewCheck: (day: string) => void;
}) {
  const days = checkCalendarDays(month);
  const checksByDay = rows.reduce<Record<string, IssuedCheck[]>>((byDay, row) => {
    if (row.status !== "cancelled") (byDay[row.due_on] ??= []).push(row);
    return byDay;
  }, {});
  const selectedChecks = selectedDay ? checksByDay[selectedDay] ?? [] : [];
  const selectedTotal = selectedChecks.reduce((sum, row) => sum + Number(row.amount), 0);

  return <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
    <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="font-black">Calendario de vencimientos</h2><p className="text-xs text-muted-foreground">Elegí un día para ver el detalle o cargar el próximo cheque.</p></div>
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="ghost" aria-label="Mes anterior" onClick={() => onMonthChange(offsetCheckMonth(month, -1))}><ChevronLeft className="size-5"/></Button>
            <span className="min-w-36 text-center text-sm font-black sm:min-w-44">{monthTitle(month)}</span>
            <Button type="button" size="icon" variant="ghost" aria-label="Mes siguiente" onClick={() => onMonthChange(offsetCheckMonth(month, 1))}><ChevronRight className="size-5"/></Button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-bold text-muted-foreground">{["L", "M", "X", "J", "V", "S", "D"].map((label, index) => <span key={`${label}-${index}`} className="py-2">{label}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(({ day, inMonth }) => {
            const dayChecks = checksByDay[day] ?? [];
            const pending = dayChecks.filter(row => row.status === "pending").length;
            const debited = dayChecks.filter(row => row.status === "debited").length;
            const isSelected = selectedDay === day;
            const isToday = today === day;
            return <button key={day} type="button" onClick={() => { if (!inMonth) onMonthChange(day.slice(0, 7)); onSelectDay(day); }}
              aria-label={`${date(day)}${dayChecks.length ? `, ${dayChecks.length} cheque${dayChecks.length === 1 ? "" : "s"}` : ", sin cheques"}`}
              className={`relative min-h-14 rounded-xl border p-1 text-sm transition hover:border-[#c77c9b] hover:bg-[#fff7fa] sm:min-h-16 ${inMonth ? "text-foreground" : "border-transparent text-muted-foreground/50"} ${isSelected ? "border-[#8f3158] bg-[#fff0f6] ring-2 ring-[#e8b3c9]" : "border-transparent"} ${isToday ? "font-black" : ""}`}>
              <span className={`mx-auto flex size-7 items-center justify-center rounded-full ${isToday ? "bg-[#3b2931] text-white" : ""}`}>{Number(day.slice(-2))}</span>
              {dayChecks.length > 0 && <span className="mt-1 flex items-center justify-center gap-1" aria-hidden="true">
                {pending > 0 && <span className="rounded-full bg-[#8f3158] px-1.5 text-[10px] font-black leading-4 text-white">{pending}</span>}
                {debited > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-black leading-4 text-white">{debited}</span>}
              </span>}
            </button>;
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#8f3158]"/>Pendiente</span><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-emerald-600"/>Debitado</span><span>El número indica cuántos cheques caen ese día.</span></div>
      </div>
      <aside className="border-t bg-[#fff9fb] p-5 lg:border-l lg:border-t-0">
        {selectedDay ? <div className="space-y-4">
          <div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Día seleccionado</p><p className="mt-1 text-xl font-black">{date(selectedDay)}</p></div>
          {selectedChecks.length ? <><div><p className="text-sm text-muted-foreground">{selectedChecks.length} cheque{selectedChecks.length === 1 ? "" : "s"}</p><p className="text-2xl font-black">{money(selectedTotal)}</p></div><div className="max-h-40 space-y-2 overflow-y-auto">{selectedChecks.map(row => <div key={row.id} className="rounded-xl border bg-white p-3 text-sm"><div className="flex justify-between gap-2"><b className="truncate">{row.beneficiary}</b><span className={`size-2.5 shrink-0 rounded-full ${row.status === "pending" ? "bg-[#8f3158]" : "bg-emerald-600"}`}/></div><p className="mt-1 text-xs text-muted-foreground">{row.number} · {money(Number(row.amount))}</p></div>)}</div></> : <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-muted-foreground">No hay cheques con vencimiento este día.</p>}
          {selectedDay >= today && <Button type="button" className="w-full bg-[#3b2931] text-white" onClick={() => onNewCheck(selectedDay)}><Plus className="size-4"/>Nuevo cheque para este día</Button>}
        </div> : <div className="flex h-full min-h-44 flex-col items-center justify-center text-center text-sm text-muted-foreground"><CalendarClock className="mb-3 size-8"/><p>Seleccioná un día para consultar los vencimientos.</p></div>}
      </aside>
    </div>
  </div>;
}

export function IssuedChecks() {
  const [rows, setRows] = useState<IssuedCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(() => argentinaDay().slice(0, 7));
  const [basis, setBasis] = useState("due_on");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      setRows(await fetchChecks()); setLoaded(true);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudieron cargar los cheques."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    fetchChecks().then(checks => { if (active) { setRows(checks); setLoaded(true); } })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "No se pudieron cargar los cheques."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const summary = summarizeChecks(rows, month);
  const today = argentinaDay();
  const week = weeklyChecks(rows, today);
  const filtered = rows.filter(row => {
    const day = basis === "issued_on" ? row.issued_on : basis === "debited_on" ? row.debited_on : row.due_on;
    const periodMatches = basis === "week" ? row.status === "pending" && row.due_on <= week.end
      : basis === "previous" ? row.status === "pending" && row.due_on < `${month}-01` : Boolean(day?.startsWith(month));
    return periodMatches && (status === "all" || row.status === status)
      && `${row.number} ${row.bank} ${row.beneficiary}`.toLocaleLowerCase("es-AR").includes(search.trim().toLocaleLowerCase("es-AR"));
  });
  const visibleTotal = filtered.filter(row => row.status !== "cancelled").reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0) / 100;
  function edit(row: IssuedCheck, debit = false) {
    setFormError("");
    setDraft({ ...row, amount: Number(row.amount).toFixed(2).replace(".", ","), ...(debit ? { status: "debited" as const, debited_on: today } : {}) });
  }
  async function save() {
    if (!draft || saving) return;
    const validation = checkInputError(draft);
    if (validation) { setFormError(validation); return; }
    setSaving(true); setFormError("");
    try {
      const response = await fetch("/api/issued-checks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows(current => [...current.filter(row => row.id !== data.check.id), data.check].sort((a, b) => a.due_on.localeCompare(b.due_on) || a.number.localeCompare(b.number)));
      setDraft(null);
    } catch (err) { setFormError(err instanceof Error ? err.message : "No se pudo guardar el cheque."); }
    finally { setSaving(false); }
  }

  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-black">Cheques emitidos</h1><p className="mt-1 text-sm text-muted-foreground">Controlá vencimientos y registrá cuándo se debita cada cheque de la cuenta.</p></div>
      <div className="flex gap-2"><Button variant="outline" disabled={loading || saving} onClick={() => void load()}><RefreshCw className="size-4"/>Actualizar</Button><Button className="bg-[#3b2931] text-white" onClick={() => { setFormError(""); setDraft(newDraft()); }}><Plus className="size-4"/>Nuevo cheque</Button></div>
    </div>
    {loaded && <div className="overflow-hidden rounded-3xl border border-[#3b2931] bg-[#3b2931] p-6 text-white shadow-lg sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-bold text-[#f4bfd3]"><CalendarClock className="size-5"/>Semana del {date(week.start)} al {date(week.end)}</div>
          <h2 className="mt-3 text-xl font-black sm:text-2xl">A debitar esta semana</h2>
          <p className="mt-2 break-words text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">{money(week.total)}</p>
          <p className="mt-3 max-w-2xl text-sm text-white/80">Incluye todos los vencidos sin debitar y los cheques que vencen hasta el domingo, aunque sean de otros meses.</p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">{week.checks.length} cheque{week.checks.length === 1 ? "" : "s"} pendiente{week.checks.length === 1 ? "" : "s"}</span>
          <Button variant="outline" className="border-white/30 bg-white text-[#3b2931] hover:bg-[#fff0f6] hover:text-[#3b2931]" onClick={() => { setBasis("week"); setStatus("pending"); setSearch(""); }}>Ver cheques de esta semana</Button>
        </div>
      </div>
    </div>}
    {loaded && <CheckCalendar
      rows={rows}
      month={month}
      today={today}
      selectedDay={selectedDay}
      onMonthChange={next => { setMonth(next); setSelectedDay(null); }}
      onSelectDay={setSelectedDay}
      onNewCheck={day => { setFormError(""); setDraft({ ...newDraft(), due_on: day }); }}
    />}
    <div className="flex flex-wrap items-end gap-4 rounded-2xl border bg-white p-4">
      <label className="space-y-1 text-sm font-bold">Mes<Input type="month" value={month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) { setMonth(event.target.value); setSelectedDay(null); } }}/></label>
      <p className="max-w-xl text-sm text-muted-foreground">Resumen del mes seleccionado. El destacado semanal siempre muestra la semana actual.</p>
    </div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} <button className="font-bold underline" onClick={() => void load()}>Reintentar</button></div>}
    {loaded && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ["Falta pagar en el mes", summary.totalPending, summary.previous > 0 ? `Incluye ${money(summary.previous)} vencidos de meses anteriores` : "Todo lo pendiente hasta el fin de este mes"],
          ["Emitido en el mes", summary.issued, "Según fecha de emisión"],
          ["Vence en el mes", summary.due, "Compromisos del mes, sin anulados"],
          ["Ya debitado del mes", summary.paid, "De los cheques que vencen en este mes"],
        ] as const).map(([label, amount, hint]) => <div key={label} className={`rounded-2xl border p-5 ${label === "Falta pagar en el mes" ? "border-[#e5aec5] bg-[#fff0f6]" : "bg-white"}`}><p className="text-sm font-bold text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black">{money(amount)}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>)}
      </div>
      <div className="space-y-4 rounded-2xl border bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-bold">Ver cheques<select className={selectClass} value={basis} onChange={event => { setBasis(event.target.value); if (event.target.value === "week") setStatus("pending"); }}><option value="week">A debitar esta semana</option><option value="due_on">Por vencimiento</option><option value="issued_on">Por emisión</option><option value="debited_on">Por débito real</option><option value="previous">Pendientes de meses anteriores</option></select></label>
          <label className="space-y-1 text-sm font-bold">Estado<select className={selectClass} value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos</option><option value="pending">Pendientes</option><option value="debited">Debitados</option><option value="cancelled">Anulados</option></select></label>
          <label className="space-y-1 text-sm font-bold">Buscar<Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Beneficiario, número o banco"/></label>
        </div>
        {basis === "week" && <p className="rounded-xl bg-[#fff0f6] px-4 py-3 text-sm">Vencidos pendientes y vencimientos hasta el {date(week.end)}. Esta vista incluye todos los meses.</p>}
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Emisión</TableHead><TableHead>Vencimiento</TableHead><TableHead>Beneficiario</TableHead><TableHead>Cheque / banco</TableHead><TableHead className="text-right">Importe</TableHead><TableHead>Estado</TableHead><TableHead>Débito real</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>
          {filtered.map(row => <TableRow key={row.id} className={row.status === "debited" ? "bg-emerald-50" : row.status === "cancelled" ? "bg-slate-50 text-muted-foreground" : ""}>
            <TableCell>{date(row.issued_on)}</TableCell><TableCell>{date(row.due_on)}{row.status === "pending" && row.due_on < today && <span className="block text-xs font-bold text-amber-700">Vencido sin débito</span>}</TableCell>
            <TableCell className="font-bold">{row.beneficiary}{row.notes && <span className="block max-w-60 whitespace-normal text-xs font-normal text-muted-foreground">{row.notes}</span>}</TableCell><TableCell>{row.number}<span className="block text-xs text-muted-foreground">{row.bank}</span></TableCell>
            <TableCell className="text-right font-bold">{money(Number(row.amount))}</TableCell><TableCell><Badge variant="outline">{statusLabel[row.status]}</Badge></TableCell><TableCell>{date(row.debited_on)}</TableCell>
            <TableCell><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => edit(row)}>Editar</Button>{row.status === "pending" && <Button size="sm" variant="outline" onClick={() => edit(row, true)}>Registrar débito</Button>}</div></TableCell>
          </TableRow>)}
          {!filtered.length && <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">No hay cheques para estos filtros.</TableCell></TableRow>}
        </TableBody></Table></div>
        <div className="flex flex-wrap justify-between gap-2 border-t pt-4 text-sm"><span>{filtered.length} cheque(s) en el listado</span><b>Total del listado (sin anulados): {money(visibleTotal)}</b></div>
      </div>
    </>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Cargando cheques…</p>}
    <Dialog open={draft !== null} onOpenChange={open => { if (!open && !saving) setDraft(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[650px]"><DialogHeader><DialogTitle>{draft?.id ? "Editar cheque" : "Nuevo cheque emitido"}</DialogTitle><DialogDescription>El vencimiento indica cuándo se puede cobrar. El débito real se carga cuando sale la plata de la cuenta.</DialogDescription></DialogHeader>
      {draft && <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4"><fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-bold">Número de cheque<Input required maxLength={200} value={draft.number} onChange={e => setDraft({ ...draft, number: e.target.value })}/></label>
        <label className="space-y-1 text-sm font-bold">Banco / cuenta<Input required maxLength={200} value={draft.bank} onChange={e => setDraft({ ...draft, bank: e.target.value })}/></label>
        <label className="space-y-1 text-sm font-bold">Beneficiario<Input required maxLength={200} value={draft.beneficiary} onChange={e => setDraft({ ...draft, beneficiary: e.target.value })}/></label>
        <label className="space-y-1 text-sm font-bold">Importe<Input required inputMode="decimal" placeholder="1.234,56" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })}/></label>
        <label className="space-y-1 text-sm font-bold">Fecha de emisión<Input required type="date" value={draft.issued_on} onChange={e => setDraft({ ...draft, issued_on: e.target.value })}/></label>
        <label className="space-y-1 text-sm font-bold">Fecha de vencimiento<Input required type="date" min={draft.issued_on} value={draft.due_on} onChange={e => setDraft({ ...draft, due_on: e.target.value })}/></label>
        <label className="space-y-1 text-sm font-bold">Estado<select className={selectClass} value={draft.status} onChange={e => { const next = e.target.value as IssuedCheck["status"]; setDraft({ ...draft, status: next, debited_on: next === "debited" ? draft.debited_on ?? today : null }); }}><option value="pending">Pendiente</option><option value="debited">Debitado</option><option value="cancelled">Anulado</option></select></label>
        {draft.status === "debited" && <label className="space-y-1 text-sm font-bold">Fecha real de débito<Input required type="date" min={draft.issued_on} max={today} value={draft.debited_on ?? ""} onChange={e => setDraft({ ...draft, debited_on: e.target.value })}/></label>}
        <label className="space-y-1 text-sm font-bold sm:col-span-2">Observaciones<Textarea maxLength={2000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label>
      </fieldset>
        {draft.status === "cancelled" && <p className="rounded-xl bg-amber-50 p-3 text-sm">Al guardar, el cheque quedará anulado y se excluirá de los totales. El registro se conserva.</p>}
        <p className="text-xs text-muted-foreground">Este registro controla los cheques emitidos. No genera otro pago en la cuenta corriente del proveedor.</p>
        {formError && <p role="alert" className="text-sm font-bold text-red-700">{formError}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(null)}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-[#3b2931] text-white">{saving ? "Guardando…" : "Guardar cheque"}</Button></DialogFooter>
      </form>}
    </DialogContent></Dialog>
  </section>;
}

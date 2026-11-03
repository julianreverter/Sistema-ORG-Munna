"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { argentinaDay, checkInputError, summarizeChecks, type IssuedCheck } from "@/lib/issued-checks";

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
  const filtered = rows.filter(row => {
    const day = basis === "issued_on" ? row.issued_on : basis === "debited_on" ? row.debited_on : row.due_on;
    const periodMatches = basis === "previous" ? row.status === "pending" && row.due_on < `${month}-01` : Boolean(day?.startsWith(month));
    return periodMatches && (status === "all" || row.status === status)
      && `${row.number} ${row.bank} ${row.beneficiary}`.toLocaleLowerCase("es-AR").includes(search.trim().toLocaleLowerCase("es-AR"));
  });
  const visibleTotal = filtered.filter(row => row.status !== "cancelled").reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0) / 100;
  const today = argentinaDay();
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
    <div className="flex flex-wrap items-end gap-4 rounded-2xl border bg-white p-4">
      <label className="space-y-1 text-sm font-bold">Mes<Input type="month" value={month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value); }}/></label>
      <p className="max-w-xl text-sm text-muted-foreground">Los totales muestran el mes seleccionado. Un cheque vencido sigue pendiente hasta que registres su débito real.</p>
    </div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} <button className="font-bold underline" onClick={() => void load()}>Reintentar</button></div>}
    {loaded && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {([
          ["Emitido en el mes", summary.issued, "Según fecha de emisión"],
          ["Vence en el mes", summary.due, "Compromisos del mes, sin anulados"],
          ["Ya debitado del mes", summary.paid, "De los cheques que vencen en este mes"],
          ["Falta pagar del mes", summary.pending, "Con vencimiento en este mes"],
          ["Pendiente de meses anteriores", summary.previous, "Todavía sin débito registrado"],
          ["Total pendiente hasta este mes", summary.totalPending, "Pendiente del mes + meses anteriores"],
        ] as const).map(([label, amount, hint]) => <div key={label} className={`rounded-2xl border p-5 ${label === "Falta pagar del mes" ? "bg-[#fff0f6]" : "bg-white"}`}><p className="text-sm font-bold text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black">{money(amount)}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>)}
      </div>
      <div className="space-y-4 rounded-2xl border bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-bold">Ver cheques<select className={selectClass} value={basis} onChange={event => setBasis(event.target.value)}><option value="due_on">Por vencimiento</option><option value="issued_on">Por emisión</option><option value="debited_on">Por débito real</option><option value="previous">Pendientes de meses anteriores</option></select></label>
          <label className="space-y-1 text-sm font-bold">Estado<select className={selectClass} value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos</option><option value="pending">Pendientes</option><option value="debited">Debitados</option><option value="cancelled">Anulados</option></select></label>
          <label className="space-y-1 text-sm font-bold">Buscar<Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Beneficiario, número o banco"/></label>
        </div>
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

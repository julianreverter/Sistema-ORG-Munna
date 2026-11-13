"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type Product = { id: number; code?: string; name: string; presentation: string };
type Item = Product & { quantity: number; delivered: number; remaining: number };
type Order = {
  id: string; number: number; clientId: number; client: string; date: string; revision: number;
  state: string; items: Item[]; note: string; requestedDate: string | null; remittances: string[];
};
type Workspace = {
  role: string; clientName: string | null; products: Product[]; orders: Order[];
  clients: { id: number; name: string; enabled: boolean }[];
  plan: (Product & { requested: number; available: number; toProduce: number })[];
};
const panel = "rounded-3xl border bg-white p-5 shadow-sm sm:p-6";
const stateLabel: Record<string, string> = { pendiente: "Pendiente", parcial: "Entrega parcial", entregado: "Entregado", cancelado: "Cancelado" };
const day = (date: string) => new Date(date.length === 10 ? date + "T12:00:00" : date).toLocaleDateString("es-AR");

async function api(url: string, body?: unknown) {
  const result = await fetch(url, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error ?? "No se pudo completar la operación.");
  return data;
}

export function Orders({ portal = false }: { portal?: boolean }) {
  const endpoint = "/api/orders" + (portal ? "?portal=1" : "");
  const [data, setData] = useState<Workspace>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order>();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("abiertos");
  const [note, setNote] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [formError, setFormError] = useState("");
  const [requestId, setRequestId] = useState("");
  const refresh = useCallback(async () => {
    const workspace = await api(endpoint) as Workspace;
    setData(workspace);
    setError("");
  }, [endpoint]);

  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      try {
        if (portal && window.location.hash.startsWith("#acceso=")) {
          const token = window.location.hash.slice("#acceso=".length);
          await api(endpoint, { action: "enter", token });
          window.history.replaceState(null, "", window.location.pathname);
        }
        if (alive) await refresh();
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los pedidos.");
      } finally { if (alive) setLoading(false); }
    };
    void initialize();
    const timer = window.setInterval(() => {
      if (!document.hidden && !busyRef.current) refresh().catch(() => setError("No se pudo actualizar. Revisá la conexión."));
    }, 30000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [endpoint, portal, refresh]);

  const canEdit = data?.role === "administracion" || data?.role === "jefe_produccion";
  const products = [...(data?.products ?? [])];
  for (const item of editing?.items ?? []) {
    if (!products.some((product) => product.id === item.id)) products.push(item);
  }
  const selected = products.filter((product) => Number(draft[product.id]) > 0);
  const start = (order?: Order) => {
    setEditing(order);
    setDraft(Object.fromEntries((order?.items ?? []).map((item) => [item.id, String(item.quantity)])));
    setNote(order?.note ?? ""); setRequestedDate(order?.requestedDate ?? "");
    setRequestId(order?.id ?? crypto.randomUUID()); setQuery(""); setFormError(""); setOpen(true);
  };
  async function mutate(body: unknown, success: string) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true);
    try {
      await api(endpoint, body);
      setNotice(success);
      // A committed write must not be retried when only the refresh fails.
      await refresh().catch(() => setError("Se guardó el cambio. Usá Actualizar para cargar el estado más reciente."));
      return true;
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const items = selected.map((product) => ({ id: product.id, quantity: Number(draft[product.id]) }));
    if (!items.length || Object.values(draft).some((value) => value !== "" && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 10000))) {
      setFormError("Seleccioná productos e ingresá cantidades enteras de hasta 10.000 unidades."); return;
    }
    try {
      const saved = await mutate({ action: "save", id: requestId, items, revision: editing?.revision, note, requestedDate }, editing ? "Pedido corregido." : "Pedido enviado a fábrica.");
      if (saved) setOpen(false);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "No se pudo guardar."); }
  }
  async function cancel(order: Order) {
    if (!window.confirm("¿Cancelar lo pendiente de este pedido? Sus entregas quedan registradas.")) return;
    try { await mutate({ action: "save", id: order.id, revision: order.revision, cancel: true, items: [] }, "Pedido cancelado."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cancelar."); }
  }
  const orders = (data?.orders ?? []).filter((order) => filter === "todos" || ["pendiente", "parcial"].includes(order.state));
  const demandByClient = new Map<number, { name: string; products: Map<number, number> }>();
  for (const order of data?.orders ?? []) {
    if (!["pendiente", "parcial"].includes(order.state)) continue;
    for (const item of order.items) {
      if (item.remaining <= 0) continue;
      let client = demandByClient.get(order.clientId);
      if (!client) {
        client = { name: order.client, products: new Map() };
        demandByClient.set(order.clientId, client);
      }
      client.products.set(item.id, (client.products.get(item.id) ?? 0) + item.remaining);
    }
  }
  const demandClients = [...demandByClient.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "es"));

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm font-semibold text-[#ad416a]">Münna · {portal ? data?.clientName ?? "Portal de pedidos" : "Fábrica"}</p>
        <h1 className="text-3xl font-black">{portal ? "Mis pedidos" : "Pedidos y producción"}</h1></div>
      <div className="flex gap-2"><Button variant="outline" disabled={busy || loading} onClick={() => refresh().catch((cause: Error) => setError(cause.message))}><RefreshCw className="size-4"/>Actualizar</Button>
        {portal && data && <Button className="bg-[#3b2931] text-white" onClick={() => start()}><Plus/>Nuevo pedido</Button>}</div>
    </div>
    {loading && <p role="status">Cargando pedidos…</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
    {!portal && data && <section className={panel}>
      <h2 className="mb-1 text-xl font-bold">Qué tenemos que producir</h2>
      <p className="mb-4 text-sm text-muted-foreground">Pedidos pendientes de entrega por cliente, en baldes, vasquetas o cajas. A producir = suma de los pedidos pendientes menos el stock disponible, con mínimo cero.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th scope="col" className="min-w-52 py-3 pr-4">Producto / sabor</th><th scope="col" className="min-w-32 px-4 text-right">Stock disponible</th>{demandClients.map(([id, client]) => <th scope="col" key={id} className="min-w-36 px-4 text-right">{client.name}</th>)}<th scope="col" className="min-w-32 px-4 text-right">A producir</th></tr></thead>
        <tbody>{data.plan.map((row) => <tr key={row.id} className="border-b last:border-0"><th scope="row" className="py-3 pr-4 font-semibold">{row.name}<span className="block text-xs font-normal text-muted-foreground">{row.presentation}</span></th><td className="px-4 text-right tabular-nums">{row.available}</td>{demandClients.map(([id, client]) => <td key={id} className="px-4 text-right tabular-nums">{client.products.get(row.id) ?? 0}</td>)}<td className="bg-pink-50 px-4 text-right font-black tabular-nums text-[#ad416a]">{row.toProduce}</td></tr>)}</tbody>
      </table></div>
      {!data.plan.length && <p className="py-6 text-center text-muted-foreground">No hay producción pendiente por pedidos.</p>}
    </section>}
    {data && <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{portal ? "Historial" : "Pedidos recibidos"}</h2><select aria-label="Estado de pedidos" className="rounded-xl border bg-white p-2" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="abiertos">Pendientes y parciales</option><option value="todos">Todos</option></select></div>
      {!orders.length && <div className={panel + " text-center text-muted-foreground"}><ShoppingBag className="mx-auto mb-3 size-8"/>{portal ? "Todavía no hay pedidos en esta vista." : "No hay pedidos en esta vista."}</div>}
      {orders.map((order) => <article key={order.id} className={panel}>
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">Pedido #{order.number} · {order.client}</h3><span className="text-sm font-semibold text-[#ad416a]">{stateLabel[order.state]}</span></div>
        <p className="mt-1 text-sm text-muted-foreground">{day(order.date)}{order.requestedDate ? " · Entrega solicitada " + day(order.requestedDate) : ""}</p>
        <div className="my-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Producto / presentación</th><th className="text-right">Pedido</th><th className="text-right">Entregado</th><th className="text-right">Pendiente</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td className="py-2">{item.name} · {item.presentation}</td><td className="text-right">{item.quantity}</td><td className="text-right">{item.delivered}</td><td className="text-right">{order.state === "cancelado" ? "—" : item.remaining}</td></tr>)}</tbody></table></div>
        {order.note && <p className="mb-3 text-sm">{order.note}</p>}
        {order.remittances.length > 0 && <p className="mb-3 text-sm text-muted-foreground">Remitos vinculados · {order.remittances.join(", ")}</p>}
        {canEdit && order.state !== "cancelado" && <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => start(order)}>Corregir pedido</Button><Button variant="ghost" disabled={busy} onClick={() => cancel(order)}>Cancelar pendiente</Button></div>}
      </article>)}
    </section>}
    <Dialog open={open} onOpenChange={(value) => {
      if (!busy && (value || window.confirm("¿Cerrar la carga del pedido? Se perderán los cambios sin enviar."))) setOpen(value);
    }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader><DialogTitle>{editing ? "Corregir pedido #" + editing.number : "Nuevo pedido"}</DialogTitle><DialogDescription>Ingresá cantidades de baldes, vasquetas o cajas. El pedido se suma al plan de fábrica al enviarlo.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={save}>
          <Input aria-label="Buscar producto" placeholder="Buscar sabor o presentación…" value={query} onChange={(event) => setQuery(event.target.value)}/>
          <div className="max-h-72 overflow-y-auto rounded-xl border">{products.filter((product) => (product.name + " " + product.presentation).toLocaleLowerCase("es-AR").includes(query.toLocaleLowerCase("es-AR").trim())).map((product) => <label key={product.id} className="flex items-center justify-between gap-4 border-b p-3 last:border-0"><span className="text-sm"><b>{product.name}</b><span className="block text-muted-foreground">{product.presentation}</span></span><Input aria-label={"Cantidad de " + product.name + " " + product.presentation} type="number" min="0" max="10000" step="1" className="w-24" value={draft[product.id] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [product.id]: event.target.value }))}/></label>)}</div>
          <div className="rounded-xl bg-[#fff4f8] p-3 text-sm"><b>{selected.length} productos seleccionados</b>{selected.map((product) => <p key={product.id}>{draft[product.id]} × {product.name} · {product.presentation}</p>)}</div>
          <label className="block text-sm font-bold">Fecha de entrega solicitada (opcional)<Input type="date" value={requestedDate} onChange={(event) => setRequestedDate(event.target.value)}/></label>
          <label className="block text-sm font-bold">Observaciones (opcional)<Input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)}/></label>
          {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
          <DialogFooter><Button type="submit" disabled={busy} className="bg-[#3b2931] text-white">{busy ? "Guardando…" : editing ? "Guardar corrección" : "Enviar pedido"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}

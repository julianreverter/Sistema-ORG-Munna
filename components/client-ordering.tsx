"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Catalog = { id: number; name: string; presentation: string; active: boolean; supported: boolean; enabled: boolean };
async function request(body?: unknown) {
  const response = await fetch("/api/orders", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
export function ClientOrdering({ customerId, onDirtyChange, onBusyChange }: { customerId: number; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void }) {
  const [clients, setClients] = useState<{ id: number; name: string; enabled: boolean }[]>([]);
  const clientId = String(customerId);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const [existingLink, setExistingLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => { request().then(data => setClients(data.clients)).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    let alive = true;
    setCatalog([]); setSelected([]); setLink(""); setExistingLink(""); setNotice(""); setError(""); setDirty(false);
    if (!clientId) return;
    setLoading(true);
    Promise.all([request({ action: "catalog", clientId: Number(clientId) }), request({ action: "saved-link", clientId: Number(clientId) })]).then(([data, saved]) => {
      if (alive) { setCatalog(data); setSelected(data.filter((p: Catalog) => p.enabled).map((p: Catalog) => p.id)); setLink(saved.token ? location.origin + "/pedidos#acceso=" + saved.token : ""); }
    }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clientId]);
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try { await request({ action: "catalog", clientId: Number(clientId), products: selected }); setDirty(false); setNotice("Catálogo guardado para este cliente."); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  async function access(revoke: boolean) {
    const current = clients.find(c => String(c.id) === clientId);
    if ((revoke || current?.enabled) && !confirm(revoke ? "¿Deshabilitar el acceso?" : "¿Generar un nuevo enlace? El anterior dejará de funcionar.")) return;
    setBusy(true); setError("");
    try {
      const result = await request({ action: "access", clientId: Number(clientId), revoke });
      setLink(result.token ? location.origin + "/pedidos#acceso=" + result.token : "");
      setClients(rows => rows.map(c => String(c.id) === clientId ? { ...c, enabled: !revoke } : c));
      setNotice(revoke ? "Acceso deshabilitado." : "Enlace generado.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar el acceso."); }
    finally { setBusy(false); }
  }
  async function preserveLink() {
    setBusy(true); setError("");
    try {
      const url = new URL(existingLink.trim());
      if (url.origin !== location.origin || url.pathname !== "/pedidos" || !/^#acceso=[0-9a-f]{64}$/.test(url.hash)) throw new Error("Pegá el enlace completo de pedidos de este sistema.");
      const result = await request({ action: "saved-link", clientId: Number(clientId), token: url.hash.slice(8) });
      setLink(location.origin + "/pedidos#acceso=" + result.token); setExistingLink(""); setNotice("Enlace guardado. Podés volver a copiarlo desde este cliente.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar el enlace."); }
    finally { setBusy(false); }
  }
  const visible = catalog.filter(p => `${p.name} ${p.presentation}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="mb-6 space-y-4 rounded-3xl border bg-white p-5 shadow-sm">
    <h2 className="text-xl font-bold">Portal de pedidos</h2>
    <p className="text-sm text-muted-foreground">Enlace guardado y productos habilitados de este cliente. Los cambios del catálogo se guardan con el botón de esta sección.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
    {loading && <p>Cargando catálogo…</p>}
    {clientId && !loading && <>
      <div className="flex flex-wrap gap-2"><Button variant={link ? "outline" : "default"} disabled={busy || dirty || selected.length === 0} onClick={() => access(false)}>{clients.find(c => String(c.id) === clientId)?.enabled ? "Reemplazar enlace" : "Generar y guardar enlace"}</Button><Button variant="outline" disabled={busy || !clients.find(c => String(c.id) === clientId)?.enabled} onClick={() => access(true)}>Deshabilitar acceso</Button></div>
      {!link && clients.find(c => String(c.id) === clientId)?.enabled && <div className="space-y-2 rounded-xl bg-amber-50 p-3"><p className="text-sm">Este acceso se creó antes de guardar los enlaces. Pegá el enlace actual para conservarlo, o reemplazalo una sola vez. Después aparecerá guardado al elegir este cliente.</p><Input aria-label="Enlace actual del cliente" placeholder="Pegá el enlace que ya compartiste" value={existingLink} onChange={e => setExistingLink(e.target.value)}/><Button variant="outline" disabled={busy || !existingLink.trim()} onClick={preserveLink}>Guardar enlace actual</Button></div>}
      {link && <div className="space-y-2"><label className="text-sm font-bold">Enlace privado<Input readOnly value={link} onFocus={e => e.target.select()}/></label><Button variant="outline" onClick={() => navigator.clipboard.writeText(link).then(() => setNotice("Enlace copiado.")).catch(() => setError("Seleccioná y copiá el enlace del campo."))}>Copiar enlace</Button></div>}
      <div className="flex flex-wrap items-center gap-3"><h3 className="font-bold">Productos habilitados ({selected.length})</h3><Input className="sm:max-w-sm" placeholder="Buscar producto o presentación" value={query} onChange={e => setQuery(e.target.value)}/></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => { setSelected(catalog.filter(p => p.active && p.supported).map(p => p.id)); setDirty(true); }}>Activar todos los disponibles</Button><Button variant="outline" disabled={busy} onClick={() => { setSelected([]); setDirty(true); }}>Desmarcar todos</Button></div>
      <div className="grid max-h-96 gap-2 overflow-y-auto rounded-xl border p-3 md:grid-cols-2">{visible.map(p => <label key={p.id} className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" className="mt-1" checked={selected.includes(p.id)} disabled={busy || !p.active || !p.supported} onChange={e => { setSelected(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id)); setDirty(true); }}/><span><b>{p.name}</b><span className="block text-sm text-muted-foreground">{p.presentation}{!p.active ? " · Inactivo" : !p.supported ? " · No disponible para pedidos por balde, vasqueta o caja" : ""}</span></span></label>)}{!visible.length && <p>No hay productos para esta búsqueda.</p>}</div>
      <p className="text-sm text-muted-foreground">Sin productos habilitados, el cliente no puede enviar pedidos nuevos. Los pedidos ya enviados conservan su historial.</p>
      <Button disabled={busy || !dirty} onClick={save}>{busy ? "Guardando…" : "Guardar productos habilitados"}</Button>
    </>}
  </section>;
}

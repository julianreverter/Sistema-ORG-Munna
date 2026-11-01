export const STOCK_REMOVAL_REASONS = [
  "Error en etiquetado",
  "Error en pesaje",
  "Mal formulado (a desperdicio)",
  "Otro",
] as const;

export function stockRemovalError(reason: unknown, comment: unknown): string | null {
  if (!STOCK_REMOVAL_REASONS.includes(reason as typeof STOCK_REMOVAL_REASONS[number])) return "Elegí un motivo de eliminación.";
  if (typeof comment !== "string" || comment.trim().length > 2000) return "El comentario debe tener hasta 2000 caracteres.";
  if (reason === "Otro" && !comment.trim()) return "Completá el comentario para el motivo Otro.";
  return null;
}

export function stockStatusLabel(status: string) {
  return status === "stock" ? "En stock" : status === "baja" ? "Eliminado" : "Despachado";
}

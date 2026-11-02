// Keep the user's decimal text while typing; convert only when saving.
export function parsePackageWeight(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text || !/^\d*(?:[.,]\d{0,3})?$/.test(text)) return null;
  const weight = Number(text.replace(",", "."));
  return Number.isFinite(weight) && weight >= 0 ? weight : null;
}

export function presentationParts(value: string) {
  const match = value.match(/^(.*?)\s+[x×]\s*(\d*)\s*$/i);
  return match ? { label: match[1], quantity: match[2] } : null;
}

export function presentationQuantityError(value: string): string | null {
  const parts = presentationParts(value);
  if (!parts) return null;
  const quantity = Number(parts.quantity);
  return Number.isSafeInteger(quantity) && quantity > 0 ? null : "Indicá una cantidad entera mayor a cero por presentación.";
}

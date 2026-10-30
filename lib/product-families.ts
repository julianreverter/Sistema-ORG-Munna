export const PRODUCT_FAMILIES = [
  { value: "Helado", label: "Helados", discountKey: "helado", requiresPackageWeight: false, unitType: "kg" },
  { value: "Postre congelado", label: "Postres congelados", discountKey: "postres", requiresPackageWeight: true, unitType: "unidad" },
  { value: "Pastelería", label: "Pastelería", discountKey: "pasteleria", requiresPackageWeight: true, unitType: "unidad" },
  { value: "Mini Tortitas", label: "Mini Tortitas", discountKey: "miniTortitas", requiresPackageWeight: false, unitType: "unidad" },
  { value: "Insumo comprado", label: "Insumos comprados", discountKey: "insumos", requiresPackageWeight: false, unitType: "unidad" },
  { value: "Indumentaria", label: "Indumentaria", discountKey: "indumentaria", requiresPackageWeight: false, unitType: "unidad" },
] as const;

export type ProductFamily = (typeof PRODUCT_FAMILIES)[number];
export type ProductFamilyName = ProductFamily["value"];
export type ProductFamilyDiscountKey = ProductFamily["discountKey"];
export type ProductFamilyDiscounts = Record<ProductFamilyDiscountKey, number>;

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("es-AR");

export function findProductFamily(value: unknown): ProductFamily | undefined {
  const normalized = normalize(value);
  return PRODUCT_FAMILIES.find((family) =>
    normalize(family.value) === normalized || normalize(family.label) === normalized,
  );
}

export function discountKeyForFamily(value: unknown): ProductFamilyDiscountKey | undefined {
  return findProductFamily(value)?.discountKey;
}

export function normalizeProductFamilyDiscounts(value: unknown): ProductFamilyDiscounts {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(PRODUCT_FAMILIES.map((family) => {
    const amount = Number(source[family.discountKey]);
    return [family.discountKey, Number.isFinite(amount) ? Math.min(100, Math.max(0, amount)) : 0];
  })) as ProductFamilyDiscounts;
}

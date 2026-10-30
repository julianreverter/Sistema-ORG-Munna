export type ProductFamilyDefinition = {
  id?: number;
  value: string;
  label: string;
  discountKey: string;
  requiresPackageWeight: boolean;
  unitType: "kg" | "unidad";
};

export const PRODUCT_FAMILIES: ProductFamilyDefinition[] = [
  { value: "Helado", label: "Helados", discountKey: "helado", requiresPackageWeight: false, unitType: "kg" },
  { value: "Postre congelado", label: "Postres congelados", discountKey: "postres", requiresPackageWeight: true, unitType: "unidad" },
  { value: "Pastelería", label: "Pastelería", discountKey: "pasteleria", requiresPackageWeight: true, unitType: "unidad" },
  { value: "Mini Tortitas", label: "Mini Tortitas", discountKey: "miniTortitas", requiresPackageWeight: false, unitType: "unidad" },
  { value: "Insumo comprado", label: "Insumos comprados", discountKey: "insumos", requiresPackageWeight: false, unitType: "unidad" },
  { value: "Indumentaria", label: "Indumentaria", discountKey: "indumentaria", requiresPackageWeight: false, unitType: "unidad" },
];

export type ProductFamilyDiscounts = Record<string, number>;

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("es-AR");

export function findProductFamily(value: unknown, families: ProductFamilyDefinition[] = PRODUCT_FAMILIES): ProductFamilyDefinition | undefined {
  const normalized = normalize(value);
  return families.find((family) =>
    normalize(family.value) === normalized || normalize(family.label) === normalized,
  );
}

export function discountKeyForFamily(value: unknown, families: ProductFamilyDefinition[] = PRODUCT_FAMILIES): string | undefined {
  return findProductFamily(value, families)?.discountKey;
}

export function normalizeProductFamilyDiscounts(value: unknown, families: ProductFamilyDefinition[] = PRODUCT_FAMILIES): ProductFamilyDiscounts {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(families.map((family) => {
    const amount = Number(source[family.discountKey]);
    return [family.discountKey, Number.isFinite(amount) ? Math.min(100, Math.max(0, amount)) : 0];
  })) as ProductFamilyDiscounts;
}

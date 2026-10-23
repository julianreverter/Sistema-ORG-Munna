import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";

type Row = Record<string, any>;

async function context() {
  const user = await getChatGPTUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const supabase = await createServerSupabaseClient();
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error || !profile?.active) throw new Error("INACTIVE_USER");
  return { user, profile, supabase };
}

const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? (value[0] ?? null) : value;
const n = (value: unknown) => Number(value ?? 0);
const today = () => new Date().toISOString().slice(0, 10);
const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const parseInvoiceMoney = (value: unknown) => {
  const cleaned = String(value ?? "").replace(/[^0-9,.-]/g, "");
  if (!cleaned) return 0;
  if (cleaned.includes(",")) return Number(cleaned.replaceAll(".", "").replace(",", ".")) || 0;
  const dots = cleaned.match(/\./g)?.length ?? 0;
  if (dots === 1 && /\.\d{1,2}$/.test(cleaned)) return Number(cleaned) || 0;
  return Number(cleaned.replaceAll(".", "")) || 0;
};
const materialNameKey = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("es-AR");
const PURCHASE_ALLOCATIONS_PREFIX = "__MUNNA_ALLOCATIONS__:";
const COST_CATALOG_PREFIX = "__MUNNA_CATALOG__:";
const catalogDescription = (kind: string, category: string, name: string) => COST_CATALOG_PREFIX + JSON.stringify({
  kind,
  category,
  catalogName: materialNameKey(name),
});
const catalogMeta = (row: Row) => {
  const raw = String(row.supplier_description ?? "");
  if (!raw.startsWith(COST_CATALOG_PREFIX)) return { kind: "material", category: "Materia prima" };
  try {
    const parsed = JSON.parse(raw.slice(COST_CATALOG_PREFIX.length));
    const kind = ["material", "service", "expense"].includes(String(parsed.kind)) ? String(parsed.kind) : "expense";
    return { kind, category: kind === "material" ? "Materia prima" : expenseCategory(parsed.category) };
  } catch {
    return { kind: "material", category: "Materia prima" };
  }
};
const decodePurchaseMeta = (value: unknown): { allocations: Row[]; dueDate: string | null } => {
  const raw = String(value ?? "");
  if (!raw.startsWith(PURCHASE_ALLOCATIONS_PREFIX)) return { allocations: [], dueDate: null };
  try {
    const parsed = JSON.parse(raw.slice(PURCHASE_ALLOCATIONS_PREFIX.length));
    if (Array.isArray(parsed)) return { allocations: parsed, dueDate: null };
    return {
      allocations: Array.isArray(parsed?.allocations) ? parsed.allocations : [],
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed?.dueDate ?? "")) ? String(parsed.dueDate) : null,
    };
  } catch {
    return { allocations: [], dueDate: null };
  }
};
const decodePurchaseAllocations = (value: unknown): Row[] => decodePurchaseMeta(value).allocations;
const expenseCategory = (value: unknown) => {
  const normalized = String(value ?? "Otros").trim().toLocaleLowerCase("es-AR");
  const allowed: Record<string, string> = { packaging: "Packaging", servicios: "Servicios", alquileres: "Alquileres", sueldos: "Sueldos", mantenimiento: "Mantenimiento", inversiones: "Inversiones", logística: "Logística", logistica: "Logística", impuestos: "Impuestos", otros: "Otros" };
  return allowed[normalized] ?? "Otros";
};

async function refreshFactoryMaterialCosts(supabase: any, requestedNames: string[] = []) {
  const [purchaseResult, itemResult, materialResult] = await Promise.all([
    supabase.from("purchases").select("id,invoice_date,cost_center").order("invoice_date", { ascending: false }).order("id", { ascending: false }).limit(5000),
    supabase.from("purchase_items").select("id,purchase_id,purchased_product_id,net_package_price,final_cost_per_unit").order("id", { ascending: true }).limit(20000),
    supabase.from("purchased_products").select("id,master_name").limit(10000),
  ]);
  const firstError = [purchaseResult, itemResult, materialResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const materialNameById = new Map<number, string>((materialResult.data ?? []).map((row: Row) => [n(row.id), String(row.master_name)] as [number, string]));
  const itemsByPurchase = new Map<number, Row[]>();
  for (const item of (itemResult.data ?? []) as Row[]) {
    const purchaseId = n(item.purchase_id);
    itemsByPurchase.set(purchaseId, [...(itemsByPurchase.get(purchaseId) ?? []), item]);
  }

  const requestedKeys = new Set(requestedNames.map(materialNameKey));
  const latestByName = new Map<string, Row>();
  for (const purchase of (purchaseResult.data ?? []) as Row[]) {
    const items = itemsByPurchase.get(n(purchase.id)) ?? [];
    const allocations = decodePurchaseAllocations(purchase.cost_center);
    items.forEach((item, index) => {
      const name = materialNameById.get(n(item.purchased_product_id)) ?? "";
      const key = materialNameKey(name);
      if (!key || (requestedKeys.size && !requestedKeys.has(key)) || String(name).startsWith("__GASTO__")) return;
      const allocation = allocations[index];
      const kind = allocation?.kind ?? "material";
      const center = allocation?.center ?? purchase.cost_center;
      if (kind !== "material" || String(center ?? "").trim().toLocaleLowerCase("es-AR") !== "fábrica" || latestByName.has(key)) return;
      latestByName.set(key, { ...item, name, invoiceDate: purchase.invoice_date });
    });
  }

  const namesToRefresh = requestedKeys.size
    ? Array.from(new Set((materialResult.data ?? []).map((row: Row) => String(row.master_name)).filter((name: string) => requestedKeys.has(materialNameKey(name)))))
    : Array.from(new Set((materialResult.data ?? []).map((row: Row) => String(row.master_name)).filter((name: string) => !name.startsWith("__GASTO__"))));
  for (const name of namesToRefresh) {
    const latest = latestByName.get(materialNameKey(name));
    const update = await supabase.from("purchased_products").update({
      last_net_package_cost: latest ? n(latest.net_package_price) : null,
      last_final_cost_per_unit: latest ? n(latest.final_cost_per_unit) : null,
      last_purchase_at: latest ? String(latest.invoiceDate) : null,
    }).eq("master_name", name);
    if (update.error) throw update.error;
  }
}

function productionRow(row: Row) {
  const product = one(row.products) as Row | null;
  const item = one(row.dispatch_items) as Row | null;
  const dispatch = item ? one(item.dispatches) as Row | null : null;
  const client = dispatch ? one(dispatch.clients) as Row | null : null;
  return {
    id: row.id,
    uniqueCode: row.unique_code,
    productCode: product?.code ?? "",
    productName: product?.name ?? "",
    presentation: product?.presentation ?? "",
    container: product?.container ?? "",
    weightKg: row.weight_kg == null ? null : n(row.weight_kg),
    units: row.units,
    responsible: row.responsible?.display_name ?? "",
    family: product?.family ?? "",
    basePriceSnapshot: n(row.base_price_snapshot),
    costPerKgSnapshot: row.cost_per_kg_snapshot == null ? null : n(row.cost_per_kg_snapshot),
    status: row.status,
    lot: row.lot,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    producedAt: row.created_at,
    dispatchedAt: row.dispatched_at,
    remittanceNumber: dispatch?.remittance_number ?? null,
    clientName: client?.name ?? null,
  };
}

function dispatchRow(row: Row) {
  const client = one(row.clients) as Row | null;
  const items = Array.isArray(row.dispatch_items) ? row.dispatch_items : [];
  return {
    id: row.id, remittanceNumber: row.remittance_number, clientId: row.client_id,
    clientName: client?.name ?? "", totalKg: n(row.total_kg), subtotal: n(row.subtotal),
    discountTotal: n(row.discount_total), total: n(row.total), status: row.status,
    createdAt: row.created_at,
    items: items.map((item: Row) => {
      const unit = one(item.production_units) as Row | null;
      const product = unit ? one(unit.products) as Row | null : null;
      return {
        uniqueCode: unit?.unique_code ?? "",
        productCode: product?.code ?? "",
        productName: product?.name ?? "",
        presentation: product?.presentation ?? "",
        container: product?.container ?? "",
        family: product?.family ?? "",
        weightKg: item.weight_kg == null ? null : n(item.weight_kg),
        units: item.units == null ? null : n(item.units),
        unitPrice: n(item.unit_price),
        discountPct: n(item.discount_pct),
        lineTotal: n(item.line_total),
      };
    }),
  };
}

export async function GET() {
  try {
    const { profile, supabase } = await context();
    const productionSelect = "*, products(code,name,family,presentation,container), responsible:profiles!production_units_responsible_id_fkey(display_name), dispatch_items(dispatches(remittance_number,clients(name)))";
    const [unitsResult, dispatchResult, customerPaymentsResult, adjustmentsResult, expensesResult, salesResult, purchasesResult, staffResult, materialsResult, suppliersResult, supplierPaymentsResult, recipesResult, productsResult] = await Promise.all([
      supabase.from("production_units").select(productionSelect).order("id", { ascending: false }).limit(5000),
      supabase.from("dispatches").select("*, clients(name), dispatch_items(*, production_units(unique_code,weight_kg,units,products(code,name,family,presentation,container)))").order("id", { ascending: false }).limit(5000),
      supabase.from("customer_payments").select("*, clients(name)").order("id", { ascending: false }).limit(500),
      supabase.from("customer_account_adjustments").select("*, clients(name)").order("id", { ascending: false }).limit(500),
      supabase.from("operating_expenses").select("*").order("id", { ascending: false }).limit(5000),
      supabase.from("local_sales").select("*").order("id", { ascending: false }).limit(5000),
      supabase.from("purchases").select("*, suppliers(name), purchase_items(id,quantity,net_package_price,vat_rate,vat_amount,line_total,final_cost_per_unit,purchased_product_id,purchased_products(master_name,supplier_description))").order("id", { ascending: false }).limit(5000),
      supabase.from("profiles").select("*").order("display_name"),
      supabase.from("purchased_products").select("*, suppliers(id,name)").eq("active", true).order("master_name"),
      supabase.from("suppliers").select("id,name,tax_mode,category,active").eq("active", true).neq("name", "Catálogo interno").order("name"),
      supabase.from("supplier_payments").select("*, suppliers(name)").order("id", { ascending: false }).limit(5000),
      supabase.from("recipes").select("*, products(code,name,family,presentation,container,unit_type,tare_kg), recipe_items(id,purchased_product_id,quantity_kg,purchased_products(master_name,last_final_cost_per_unit,cost_unit))").eq("active", true).order("name"),
      supabase.from("products").select("code,name,family,presentation,container,unit_type,tare_kg,base_price,ingredients,expiry_days,active").order("name"),
    ]);
    const firstError = [unitsResult, dispatchResult, customerPaymentsResult, adjustmentsResult, expensesResult, salesResult, purchasesResult, staffResult, materialsResult, suppliersResult, supplierPaymentsResult, recipesResult, productsResult].find((r) => r.error)?.error;
    if (firstError) throw firstError;

    const allUnits = (unitsResult.data ?? []).map(productionRow);
    const allDispatches = (dispatchResult.data ?? []).map(dispatchRow);
    const canSeeFinancials = profile.role === "administracion";
    const canSeeCosts = canSeeFinancials || profile.role === "jefe_produccion";
    const lastNumeric = allUnits.map((u) => Number(u.uniqueCode)).filter(Number.isFinite).reduce((max, code) => Math.max(max, code), 4529);
    const role = profile.role === "maestro_heladero" ? "produccion" : profile.role === "jefe_produccion" ? "encargado" : "administracion";

    const normalizeMaterialName = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("es-AR");
    const materialByName = new Map<string, Row>();
    for (const material of (materialsResult.data ?? []) as Row[]) {
      if (String(material.master_name ?? "").startsWith("__GASTO__")) continue;
      const key = normalizeMaterialName(material.master_name);
      const current = materialByName.get(key);
      const currentDate = String(current?.last_purchase_at ?? "");
      const candidateDate = String(material.last_purchase_at ?? "");
      if (!current || candidateDate > currentDate || (candidateDate === currentDate && n(material.id) < n(current.id))) {
        materialByName.set(key, material);
      }
    }
    const materialRows = Array.from(materialByName.values()).sort((a, b) => String(a.master_name).localeCompare(String(b.master_name), "es"));

    const purchaseRows = (purchasesResult.data ?? []).map((r: Row) => {
      const items = Array.isArray(r.purchase_items) ? r.purchase_items : [];
      const vat21 = items.filter((item: Row) => n(item.vat_rate) === 21).reduce((sum: number, item: Row) => sum + n(item.vat_amount), 0);
      const vat105 = items.filter((item: Row) => n(item.vat_rate) === 10.5).reduce((sum: number, item: Row) => sum + n(item.vat_amount), 0);
      const purchaseMeta = decodePurchaseMeta(r.cost_center);
      const allocations = purchaseMeta.allocations.map((allocation) => ({
        kind: ["material", "service", "expense"].includes(String(allocation.kind)) ? String(allocation.kind) : "expense",
        category: String(allocation.category ?? "Otros"),
        center: String(allocation.center ?? "Fábrica"),
        description: String(allocation.description ?? "Sin detalle"),
        gross: n(allocation.gross),
      }));
      const orderedItems = [...items].sort((a: Row, b: Row) => n(a.id) - n(b.id));
      const lines = orderedItems.map((item: Row, index: number) => {
        const allocation = allocations[index];
        const purchasedProduct = one(item.purchased_products) as Row | null;
        const vatRate = n(item.vat_rate);
        return {
          id: n(item.id),
          product: allocation?.description ?? purchasedProduct?.master_name ?? purchasedProduct?.supplier_description ?? "Sin detalle",
          quantity: n(item.quantity),
          unitNet: n(item.net_package_price),
          vatRate,
          vatAmount: n(item.vat_amount),
          total: n(item.line_total),
          finalCostPerUnit: n(item.final_cost_per_unit),
          kind: allocation?.kind ?? "material",
          category: allocation?.category ?? "Materia prima",
          center: allocation?.center ?? String(r.cost_center ?? "Fábrica"),
          priceMode: vatRate > 0 ? "excluded" : "black",
        };
      });
      const centers = Array.from(new Set(allocations.map((allocation) => allocation.center)));
      const displayCenter = allocations.length ? centers.length === 1 ? centers[0] : "Mixto" : String(r.cost_center ?? "Fábrica");
      return {
        id: r.id,
        supplierId: r.supplier_id,
        supplierName: one(r.suppliers)?.name ?? "",
        supplier: one(r.suppliers)?.name ?? "",
        invoiceNumber: r.invoice_number,
        invoice: r.invoice_number,
        invoiceDate: r.invoice_date,
        dueDate: purchaseMeta.dueDate,
        dueDateDisplay: purchaseMeta.dueDate ? new Date(`${purchaseMeta.dueDate}T12:00:00`).toLocaleDateString("es-AR") : "Sin vencimiento",
        date: new Date(`${r.invoice_date}T12:00:00`).toLocaleDateString("es-AR"),
        costCenter: displayCenter,
        center: displayCenter,
        allocations,
        lines,
        paymentStatus: r.payment_status,
        status: r.payment_status === "cuenta_corriente" ? "Cuenta corriente" : "Pagado",
        netTotal: n(r.net_total),
        net: n(r.net_total),
        vatTotal: n(r.vat_total),
        vat21,
        vat105,
        tax: n(r.vat_total),
        grossTotal: n(r.gross_total),
        total: n(r.gross_total),
        detail: allocations.length ? `${allocations.length} ${allocations.length === 1 ? "renglón" : "renglones"}` : `${items.length} ${items.length === 1 ? "producto" : "productos"}`,
        createdAt: r.created_at,
      };
    });
    const supplierPaymentRows = (supplierPaymentsResult.data ?? []).map((r: Row) => ({
      id: r.id,
      supplierId: r.supplier_id,
      supplier: one(r.suppliers)?.name ?? "",
      paymentDate: r.payment_date,
      date: new Date(`${r.payment_date}T12:00:00`).toLocaleDateString("es-AR"),
      amount: n(r.amount),
      method: r.method,
      reference: r.reference ?? "Sin referencia",
      note: r.notes ?? "Pago a cuenta",
      createdAt: r.created_at,
    }));
    const supplierRows = (suppliersResult.data ?? []).map((r: Row) => {
      const supplierPurchases = purchaseRows.filter((purchase: Row) => n(purchase.supplierId) === n(r.id));
      const supplierPayments = supplierPaymentRows.filter((payment: Row) => n(payment.supplierId) === n(r.id));
      const invoiced = supplierPurchases.filter((purchase: Row) => purchase.paymentStatus === "cuenta_corriente").reduce((sum: number, purchase: Row) => sum + n(purchase.grossTotal), 0);
      const paid = supplierPayments.reduce((sum: number, payment: Row) => sum + n(payment.amount), 0);
      const lastPurchase = supplierPurchases[0];
      return {
        id: r.id,
        name: r.name,
        taxMode: r.tax_mode === "con_iva" ? "Con IVA" : r.tax_mode === "sin_iva" ? "Sin IVA" : "Revisar",
        category: r.category ?? "",
        active: r.active,
        debt: invoiced - paid,
        invoices: supplierPurchases.length === 1 ? "1 factura" : `${supplierPurchases.length} facturas`,
        date: lastPurchase?.date ?? "Sin compras",
      };
    });
    const formulaRows = (recipesResult.data ?? []).map((r: Row) => {
      const product = one(r.products) as Row | null;
      const items = (Array.isArray(r.recipe_items) ? r.recipe_items : []).map((item: Row) => {
        const linkedMaterial = one(item.purchased_products) as Row | null;
        const material = materialByName.get(normalizeMaterialName(linkedMaterial?.master_name)) ?? linkedMaterial;
        const quantity = n(item.quantity_kg);
        const unitCost = n(material?.last_final_cost_per_unit);
        return {
          id: item.id,
          materialId: material?.id ?? item.purchased_product_id,
          materialName: material?.master_name ?? "",
          quantityKg: quantity,
          unitCost,
          lineCost: quantity * unitCost,
        };
      });
      const storedYieldKg = n(r.yield_kg) > 0 ? n(r.yield_kg) : 1;
      const normalizedItems = items.map((item: Row) => ({
        ...item,
        quantityKg: n(item.quantityKg) / storedYieldKg,
        lineCost: n(item.lineCost) / storedYieldKg,
      }));
      const costPerKg = normalizedItems.reduce((sum: number, item: Row) => sum + n(item.lineCost), 0);
      return {
        id: r.id,
        productCode: product?.code ?? "",
        productName: product?.name ?? r.name,
        name: r.name,
        yieldKg: 1,
        batch: "1 kg",
        ingredients: normalizedItems.length,
        recipe: costPerKg,
        perKg: costPerKg,
        packageWeightKg: n(product?.tare_kg),
        presentationCost: n(product?.tare_kg) > 0 ? costPerKg * n(product?.tare_kg) : null,
        updated: new Date(r.updated_at ?? r.created_at).toLocaleDateString("es-AR"),
        items: normalizedItems,
      };
    });

    return Response.json({
      stock: allUnits.filter((u) => u.status === "stock"),
      productionHistory: canSeeCosts ? allUnits : allUnits.map(({ costPerKgSnapshot: _cost, ...unit }) => unit),
      recentDispatches: profile.role === "maestro_heladero" ? [] : allDispatches.slice(0, 50),
      remittances: profile.role === "maestro_heladero" ? [] : allDispatches.slice(0, 500),
      customerPayments: canSeeFinancials ? (customerPaymentsResult.data ?? []).map((r: Row) => ({ ...r, clientId: r.client_id, clientName: one(r.clients)?.name, paymentDate: r.payment_date, createdAt: r.created_at })) : [],
      customerAdjustments: canSeeFinancials ? (adjustmentsResult.data ?? []).map((r: Row) => ({ ...r, clientId: r.client_id, clientName: one(r.clients)?.name, movementDate: r.movement_date, movementType: r.movement_type, signedAmount: n(r.signed_amount), createdAt: r.created_at })) : [],
      operatingExpenses: canSeeFinancials ? (expensesResult.data ?? []).map((r: Row) => {
        const labels: Record<string, string> = { servicios: "Servicios", alquileres: "Alquileres", sueldos: "Sueldos", mantenimiento: "Mantenimiento", inversiones: "Inversiones", otros: "Otros" };
        return { ...r, expenseDate: r.expense_date, createdAt: r.created_at, amount: n(r.amount), category: labels[String(r.category)] ?? "Otros" };
      }) : [],
      localSales: canSeeFinancials ? (salesResult.data ?? []).map((r: Row) => ({ ...r, saleDate: r.sale_date, createdAt: r.created_at, amount: n(r.amount) })) : [],
      purchases: canSeeFinancials ? purchaseRows : [],
      supplierPayments: canSeeFinancials ? supplierPaymentRows : [],
      rawMaterials: canSeeCosts ? materialRows.map((r: Row) => {
        const unit = String(r.cost_unit ?? "kg");
        const content = n(r.content_per_package);
        const cost = n(r.last_final_cost_per_unit);
        const meta = catalogMeta(r);
        return {
          id: r.id,
          name: r.master_name,
          kind: meta.kind,
          category: meta.category,
          unit,
          contentPerPackage: content,
          pack: `${content.toLocaleString("es-AR", { maximumFractionDigits: 3 })} ${unit}`,
          vat: n(r.vat_rate),
          cost,
          previous: cost,
          date: r.last_purchase_at ? new Date(`${r.last_purchase_at}T12:00:00`).toLocaleDateString("es-AR") : "Sin compras",
          active: r.active,
        };
      }) : [],
      suppliers: canSeeFinancials ? supplierRows : [],
      formulas: canSeeCosts ? formulaRows : [],
      productProfiles: (productsResult.data ?? []).map((r: Row) => ({
        code: String(r.code),
        name: String(r.name),
        family: String(r.family),
        presentation: String(r.presentation),
        container: String(r.container),
        unitType: String(r.unit_type),
        packageWeightKg: n(r.tare_kg),
        price: n(r.base_price),
        ingredients: String(r.ingredients ?? ""),
        expiryDays: n(r.expiry_days),
        active: r.active !== false,
      })),
      financialDispatches: canSeeFinancials ? allDispatches : [],
      staff: (staffResult.data ?? []).map((r: Row) => ({ id: r.id, email: r.email, displayName: r.display_name, role: r.role === "maestro_heladero" ? "produccion" : r.role === "jefe_produccion" ? "encargado" : "administracion", active: r.active })),
      currentUser: { id: profile.id, email: profile.email, displayName: profile.display_name, role, active: profile.active },
      nextUniqueCode: String(lastNumeric + 1).padStart(6, "0"), mode: "supabase",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof (error as Row)?.message === "string" ? String((error as Row).message) : "Error inesperado";
    const unauthorized = message === "UNAUTHORIZED" || message === "INACTIVE_USER";
    return Response.json({ error: unauthorized ? "Iniciá sesión para usar el sistema." : message }, { status: unauthorized ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, profile, supabase } = await context();
    const payload = await request.json() as Row;
    const financial = ["register-purchase", "update-purchase", "delete-purchase", "mark-purchase-paid", "register-raw-material", "update-raw-material", "archive-raw-material", "save-supplier", "update-supplier", "archive-supplier", "register-supplier-payment", "save-recipe", "save-product-profile", "archive-product", "register-customer-payment", "register-customer-adjustment", "register-expense", "register-local-sale", "save-staff"];
    if (financial.includes(String(payload.action)) && profile.role !== "administracion") return Response.json({ error: "No tenés permiso para esta operación." }, { status: 403 });

    if (payload.action === "register-production") {
      const record = payload.record as Row;
      if (!record?.uniqueCode || !record.productCode) return Response.json({ error: "Faltan datos de producción." }, { status: 400 });
      let { data: product } = await supabase.from("products").select("id").eq("code", String(record.productCode)).maybeSingle();
      if (!product) {
        const created = await supabase.from("products").insert({ code: String(record.productCode), name: String(record.productName ?? record.productCode), family: String(record.family ?? "Helado"), presentation: String(record.presentation ?? ""), container: String(record.container ?? ""), unit_type: record.units == null ? "kg" : "unidad", base_price: n(record.price) }).select("id").single();
        if (created.error) throw created.error;
        product = created.data;
      }

      const recipeResult = await supabase.from("recipes").select("yield_kg, recipe_items(quantity_kg,purchased_products(last_final_cost_per_unit))").eq("product_id", product.id).eq("active", true).maybeSingle();
      if (recipeResult.error) throw recipeResult.error;
      const recipe = recipeResult.data as Row | null;
      const recipeItems = Array.isArray(recipe?.recipe_items) ? recipe.recipe_items as Row[] : [];
      const recipeCost = recipeItems.reduce((sum: number, item: Row) => {
        const material = one(item.purchased_products) as Row | null;
        return sum + n(item.quantity_kg) * n(material?.last_final_cost_per_unit);
      }, 0);
      const yieldKg = n(recipe?.yield_kg);
      const costPerKgSnapshot = yieldKg > 0 ? recipeCost / yieldKg : null;

      const saved = await supabase.from("production_units").insert({
        unique_code: String(record.uniqueCode), product_id: product.id, weight_kg: record.weight == null ? null : n(record.weight),
        units: record.units == null ? null : n(record.units), responsible_id: user.id, created_by: user.id,
        base_price_snapshot: n(record.price), cost_per_kg_snapshot: costPerKgSnapshot, lot: record.lot || null, expires_at: record.expiresAt || null,
      }).select().single();
      if (saved.error) throw saved.error;
      return Response.json({ unit: saved.data, costPerKgSnapshot }, { status: 201 });
    }

    if (payload.action === "create-dispatch") {
      const codes = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
      const incomingClient = payload.client as Row;
      if (!codes.length || !incomingClient?.name) return Response.json({ error: "Faltan cliente o productos." }, { status: 400 });
      let { data: client } = await supabase.from("clients").select("*").eq("name", String(incomingClient.name)).maybeSingle();
      if (!client) {
        const created = await supabase.from("clients").insert({ name: String(incomingClient.name), kind: String(incomingClient.type ?? "Cliente"), discounts: incomingClient.discounts ?? {}, returnable: incomingClient.returnable !== false, billing_weight: String(incomingClient.billingWeight ?? "Neto") }).select().single();
        if (created.error) throw created.error;
        client = created.data;
      }
      const unitsResult = await supabase.from("production_units").select("*, products(family)").in("unique_code", codes).eq("status", "stock");
      if (unitsResult.error) throw unitsResult.error;
      const units = unitsResult.data ?? [];
      if (units.length !== codes.length) return Response.json({ error: "Uno o más códigos ya no están disponibles en stock." }, { status: 409 });
      const discounts = incomingClient.discounts ?? client.discounts ?? {};
      const lines = units.map((unit: Row) => {
        const family = String(one(unit.products)?.family ?? "helado").toLowerCase();
        const discount = n(discounts[family] ?? discounts.helado);
        const quantity = n(unit.weight_kg ?? unit.units);
        const subtotal = quantity * n(unit.base_price_snapshot);
        return { unit, discount, subtotal, total: subtotal * (1 - discount / 100) };
      });
      const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
      const total = lines.reduce((sum, line) => sum + line.total, 0);
      const dispatchResult = await supabase.from("dispatches").insert({ remittance_number: `R-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`, client_id: client.id, total_kg: units.reduce((sum: number, unit: Row) => sum + n(unit.weight_kg), 0), subtotal, discount_total: subtotal - total, total, created_by: user.id }).select().single();
      if (dispatchResult.error) throw dispatchResult.error;
      const itemsResult = await supabase.from("dispatch_items").insert(lines.map((line) => ({ dispatch_id: dispatchResult.data.id, production_unit_id: line.unit.id, weight_kg: line.unit.weight_kg, units: line.unit.units, unit_price: line.unit.base_price_snapshot, discount_pct: line.discount, line_total: line.total })));
      if (itemsResult.error) throw itemsResult.error;
      const updateResult = await supabase.from("production_units").update({ status: "despachado", dispatched_at: new Date().toISOString() }).in("unique_code", codes);
      if (updateResult.error) throw updateResult.error;
      return Response.json({ dispatch: dispatchRow({ ...dispatchResult.data, clients: client }) }, { status: 201 });
    }

    if (payload.action === "update-supplier") {
      const supplierId = n(payload.supplierId);
      const supplier = payload.supplier as Row;
      const name = String(supplier?.name ?? "").trim();
      const taxMode = ["con_iva", "sin_iva", "revisar"].includes(String(supplier?.taxMode)) ? String(supplier.taxMode) : "revisar";
      const category = String(supplier?.category ?? "").trim() || null;
      if (!supplierId || !name) return Response.json({ error: "Ingresá el nombre del proveedor." }, { status: 400 });

      const suppliersResult = await supabase.from("suppliers").select("id,name,active");
      if (suppliersResult.error) throw suppliersResult.error;
      const current = (suppliersResult.data ?? []).find((row: Row) => n(row.id) === supplierId && row.active !== false);
      if (!current) return Response.json({ error: "El proveedor ya no existe o fue archivado." }, { status: 404 });
      const duplicate = (suppliersResult.data ?? []).some((row: Row) => n(row.id) !== supplierId && row.active !== false && materialNameKey(row.name) === materialNameKey(name));
      if (duplicate) return Response.json({ error: "Ya existe otro proveedor con ese nombre." }, { status: 409 });

      const updated = await supabase.from("suppliers").update({ name, tax_mode: taxMode, category }).eq("id", supplierId).select("*").single();
      if (updated.error) throw updated.error;
      return Response.json({ supplier: updated.data });
    }

    if (payload.action === "archive-supplier") {
      const supplierId = n(payload.supplierId);
      if (!supplierId) return Response.json({ error: "Falta el proveedor a archivar." }, { status: 400 });

      const archived = await supabase.from("suppliers").update({ active: false }).eq("id", supplierId).eq("active", true).select("id,name,active").maybeSingle();
      if (archived.error) throw archived.error;
      if (!archived.data) return Response.json({ error: "El proveedor ya no existe o ya fue archivado." }, { status: 404 });
      return Response.json({ supplier: archived.data });
    }

    if (payload.action === "save-supplier") {
      const supplier = payload.supplier as Row;
      const name = String(supplier?.name ?? "").trim();
      const taxMode = ["con_iva", "sin_iva", "revisar"].includes(String(supplier?.taxMode)) ? String(supplier.taxMode) : "revisar";
      if (!name) return Response.json({ error: "Ingresá el nombre del proveedor." }, { status: 400 });
      const saved = await supabase.from("suppliers").insert({ name, tax_mode: taxMode, category: String(supplier?.category ?? "").trim() || null, active: true }).select("*").single();
      if (saved.error) throw saved.error;
      return Response.json({ supplier: saved.data }, { status: 201 });
    }

    if (payload.action === "register-supplier-payment") {
      const payment = payload.payment as Row;
      const supplierName = String(payment?.supplier ?? "").trim();
      const amount = Math.abs(n(payment?.amount));
      if (!supplierName || amount <= 0) return Response.json({ error: "Seleccioná un proveedor e ingresá un monto mayor a cero." }, { status: 400 });
      const supplierResult = await supabase.from("suppliers").select("id").eq("name", supplierName).maybeSingle();
      if (supplierResult.error) throw supplierResult.error;
      if (!supplierResult.data) return Response.json({ error: "El proveedor seleccionado no existe." }, { status: 404 });
      const saved = await supabase.from("supplier_payments").insert({
        supplier_id: supplierResult.data.id,
        payment_date: payment.paymentDate || today(),
        amount,
        method: ({ Transferencia: "transferencia", Efectivo: "efectivo", Echeq: "echeq", "Cheque de tercero": "cheque_tercero", Mercadería: "mercaderia" } as Record<string, string>)[String(payment.method)] ?? String(payment.method ?? "transferencia").toLowerCase(),
        reference: String(payment.reference ?? "").trim() || null,
        notes: String(payment.note ?? "").trim() || null,
        created_by: user.id,
      }).select("*").single();
      if (saved.error) throw saved.error;
      return Response.json({ payment: saved.data }, { status: 201 });
    }

    if (payload.action === "archive-product") {
      const product = payload.product as Row;
      const code = String(product?.code ?? "").trim();
      if (!code) return Response.json({ error: "Falta el código del producto." }, { status: 400 });

      const existing = await supabase.from("products").select("id").eq("code", code).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        const archived = await supabase.from("products").update({ active: false }).eq("id", existing.data.id).select("id,code,active").single();
        if (archived.error) throw archived.error;
        return Response.json({ product: archived.data });
      }

      const created = await supabase.from("products").insert({
        code,
        name: String(product.name ?? code),
        family: String(product.family ?? "Sin categoría"),
        presentation: String(product.presentation ?? ""),
        container: String(product.container ?? ""),
        unit_type: String(product.family ?? "") === "Helado" ? "kg" : "unidad",
        tare_kg: Math.max(0, n(product.packageWeightKg)),
        base_price: Math.max(0, n(product.price)),
        ingredients: String(product.ingredients ?? ""),
        expiry_days: Math.max(1, n(product.expiryDays) || 365),
        active: false,
      }).select("id,code,active").single();
      if (created.error) throw created.error;
      return Response.json({ product: created.data }, { status: 201 });
    }

    if (payload.action === "save-product-profile") {
      const product = payload.product as Row;
      const code = String(product?.code ?? "").trim();
      const name = String(product?.name ?? "").trim();
      const family = String(product?.family ?? "").trim();
      const packageWeightKg = n(product?.packageWeightKg);
      const needsWeight = ["postre congelado", "pastelería"].includes(family.toLocaleLowerCase("es-AR"));
      if (!code || !name || !family) return Response.json({ error: "Completá código, nombre y familia." }, { status: 400 });
      if (needsWeight && packageWeightKg <= 0) return Response.json({ error: "Indicá cuántos kg netos trae la presentación para poder costearla." }, { status: 400 });

      const saved = await supabase.from("products").upsert({
        code,
        name,
        family,
        presentation: String(product.presentation ?? ""),
        container: String(product.container ?? ""),
        unit_type: family === "Helado" ? "kg" : "unidad",
        tare_kg: Math.max(0, packageWeightKg),
        base_price: Math.max(0, n(product.price)),
        ingredients: String(product.ingredients ?? ""),
        expiry_days: Math.max(1, n(product.expiryDays) || 365),
        active: true,
      }, { onConflict: "code" }).select("*").single();
      if (saved.error) throw saved.error;
      return Response.json({ product: { ...saved.data, packageWeightKg: n(saved.data.tare_kg) } });
    }

    if (payload.action === "save-recipe") {
      const recipe = payload.recipe as Row;
      const productData = recipe?.product as Row;
      const productCode = String(productData?.code ?? recipe?.productCode ?? "").trim();
      const name = String(recipe?.name ?? productData?.name ?? "").trim();
      const items = Array.isArray(recipe?.items) ? recipe.items as Row[] : [];
      const totalQuantityKg = items.reduce((sum, item) => sum + n(item.quantityKg), 0);
      const totalInTenThousandths = Math.round(totalQuantityKg * 10000);
      if (!productCode || !name || !items.length) return Response.json({ error: "Elegí el producto y agregá al menos una materia prima." }, { status: 400 });
      if (items.some((item) => n(item.materialId) <= 0 || n(item.quantityKg) <= 0)) return Response.json({ error: "Revisá las materias primas y sus cantidades." }, { status: 400 });
      if (totalInTenThousandths !== 10000) return Response.json({ error: `La fórmula debe sumar exactamente 1,0000 kg. Actualmente suma ${totalQuantityKg.toLocaleString("es-AR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} kg.` }, { status: 400 });

      let { data: product, error: productError } = await supabase.from("products").select("id").eq("code", productCode).maybeSingle();
      if (productError) throw productError;
      if (!product) {
        const createdProduct = await supabase.from("products").insert({
          code: productCode,
          name: String(productData?.name ?? name),
          family: String(productData?.family ?? "Helado"),
          presentation: String(productData?.presentation ?? "Producción"),
          container: String(productData?.container ?? ""),
          unit_type: "kg",
          base_price: n(productData?.price),
          ingredients: String(productData?.ingredients ?? ""),
          expiry_days: Math.max(1, n(productData?.expiryDays) || 365),
        }).select("id").single();
        if (createdProduct.error) throw createdProduct.error;
        product = createdProduct.data;
      }

      const savedRecipe = await supabase.from("recipes").upsert({
        product_id: product.id,
        name,
        yield_kg: 1,
        active: true,
      }, { onConflict: "product_id" }).select("*").single();
      if (savedRecipe.error) throw savedRecipe.error;
      const deleteItems = await supabase.from("recipe_items").delete().eq("recipe_id", savedRecipe.data.id);
      if (deleteItems.error) throw deleteItems.error;
      const savedItems = await supabase.from("recipe_items").insert(items.map((item) => ({
        recipe_id: savedRecipe.data.id,
        purchased_product_id: n(item.materialId),
        quantity_kg: n(item.quantityKg),
      })));
      if (savedItems.error) throw savedItems.error;
      return Response.json({ recipe: savedRecipe.data }, { status: 201 });
    }

    if (payload.action === "update-raw-material") {
      const material = payload.material as Row;
      const originalName = String(payload.originalName ?? "").trim();
      const name = String(material?.name ?? "").trim();
      const kind = ["material", "service", "expense"].includes(String(material?.kind)) ? String(material.kind) : "material";
      const category = kind === "material" ? "Materia prima" : expenseCategory(material?.category);
      const unit = kind === "material" && String(material?.unit ?? "kg") !== "unidad" ? "kg" : "unidad";
      const contentPerPackage = kind === "material" ? n(material?.contentPerPackage) : 1;
      const vatRate = [0, 10.5, 21].includes(n(material?.vat)) ? n(material?.vat) : 21;
      if (!originalName || !name || contentPerPackage <= 0) return Response.json({ error: "Completá el nombre y un contenido por envase mayor a cero." }, { status: 400 });

      const catalogResult = await supabase.from("purchased_products").select("id,master_name,active");
      if (catalogResult.error) throw catalogResult.error;
      const currentRows = (catalogResult.data ?? []).filter((row: Row) => materialNameKey(row.master_name) === materialNameKey(originalName));
      if (!currentRows.length) return Response.json({ error: "La materia prima ya no existe o fue archivada." }, { status: 404 });
      const currentIds = new Set(currentRows.map((row: Row) => n(row.id)));
      const duplicate = (catalogResult.data ?? []).some((row: Row) => !currentIds.has(n(row.id)) && row.active !== false && materialNameKey(row.master_name) === materialNameKey(name));
      if (duplicate) return Response.json({ error: "Ya existe otra materia prima con ese nombre." }, { status: 409 });

      const ids = currentRows.map((row: Row) => n(row.id));
      const updated = await supabase.from("purchased_products").update({
        master_name: name,
        cost_unit: unit,
        content_per_package: contentPerPackage,
        vat_rate: vatRate,
        supplier_description: catalogDescription(kind, category, name),
      }).in("id", ids).select("id,master_name,cost_unit,content_per_package,vat_rate,active");
      if (updated.error) throw updated.error;
      return Response.json({ material: updated.data?.[0], updatedRows: updated.data?.length ?? 0 });
    }

    if (payload.action === "archive-raw-material") {
      const name = String(payload.name ?? "").trim();
      if (!name) return Response.json({ error: "Falta la materia prima a archivar." }, { status: 400 });

      const catalogResult = await supabase.from("purchased_products").select("id,master_name,active");
      if (catalogResult.error) throw catalogResult.error;
      const ids = (catalogResult.data ?? [])
        .filter((row: Row) => row.active !== false && materialNameKey(row.master_name) === materialNameKey(name))
        .map((row: Row) => n(row.id));
      if (!ids.length) return Response.json({ error: "La materia prima ya no existe o ya fue archivada." }, { status: 404 });

      const archived = await supabase.from("purchased_products").update({ active: false }).in("id", ids).select("id,master_name,active");
      if (archived.error) throw archived.error;
      return Response.json({ archivedRows: archived.data?.length ?? 0 });
    }

    if (payload.action === "register-raw-material") {
      const material = payload.material as Row;
      const name = String(material?.name ?? "").trim();
      const kind = ["material", "service", "expense"].includes(String(material?.kind)) ? String(material.kind) : "material";
      const category = kind === "material" ? "Materia prima" : expenseCategory(material?.category);
      const unit = kind === "material" && String(material?.unit ?? "kg") !== "unidad" ? "kg" : "unidad";
      const contentPerPackage = kind === "material" ? n(material?.contentPerPackage) : 1;
      const vatRate = [0, 10.5, 21].includes(n(material?.vat)) ? n(material?.vat) : 21;
      if (!name || contentPerPackage <= 0) return Response.json({ error: "Completá el nombre y un contenido por envase mayor a cero." }, { status: 400 });

      const existing = await supabase.from("purchased_products").select("id,active").ilike("master_name", name).order("active", { ascending: false }).limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data && existing.data.active !== false) return Response.json({ error: "Ya existe un insumo o servicio con ese nombre. Podés encontrarlo con el buscador." }, { status: 409 });

      if (existing.data) {
        const reactivated = await supabase.from("purchased_products").update({
          master_name: name,
          supplier_description: catalogDescription(kind, category, name),
          cost_unit: unit,
          content_per_package: contentPerPackage,
          vat_rate: vatRate,
          active: true,
        }).eq("id", existing.data.id).select("*").single();
        if (reactivated.error) throw reactivated.error;
        return Response.json({ material: reactivated.data, reactivated: true }, { status: 201 });
      }

      let { data: catalogSupplier, error: supplierError } = await supabase.from("suppliers").select("id").eq("name", "Catálogo interno").maybeSingle();
      if (supplierError) throw supplierError;
      if (!catalogSupplier) {
        const createdSupplier = await supabase.from("suppliers").insert({ name: "Catálogo interno", tax_mode: "revisar", category: "Sistema", active: true }).select("id").single();
        if (createdSupplier.error) throw createdSupplier.error;
        catalogSupplier = createdSupplier.data;
      }

      const created = await supabase.from("purchased_products").insert({
        master_name: name,
        supplier_id: catalogSupplier.id,
        supplier_description: catalogDescription(kind, category, name),
        cost_unit: unit,
        content_per_package: contentPerPackage,
        vat_rate: vatRate,
        active: true,
      }).select("*").single();
      if (created.error) throw created.error;
      return Response.json({
        material: {
          id: created.data.id,
          name: created.data.master_name,
          kind,
          category,
          unit: created.data.cost_unit,
          contentPerPackage: n(created.data.content_per_package),
          pack: `${n(created.data.content_per_package).toLocaleString("es-AR", { maximumFractionDigits: 3 })} ${created.data.cost_unit}`,
          vat: n(created.data.vat_rate),
          cost: 0,
          previous: 0,
          date: "Sin compras",
          active: created.data.active,
        },
      }, { status: 201 });
    }

    if (payload.action === "delete-purchase") {
      const purchaseId = n(payload.purchaseId);
      if (!purchaseId) return Response.json({ error: "Falta la factura a eliminar." }, { status: 400 });
      const oldItems = await supabase.from("purchase_items").select("purchased_products(master_name)").eq("purchase_id", purchaseId);
      if (oldItems.error) throw oldItems.error;
      const affectedNames = (oldItems.data ?? []).map((item: Row) => String(one(item.purchased_products)?.master_name ?? "")).filter(Boolean);
      const deleteItems = await supabase.from("purchase_items").delete().eq("purchase_id", purchaseId);
      if (deleteItems.error) throw deleteItems.error;
      const deleted = await supabase.from("purchases").delete().eq("id", purchaseId).select("id").maybeSingle();
      if (deleted.error) throw deleted.error;
      if (!deleted.data) return Response.json({ error: "La factura ya no existe." }, { status: 404 });
      await refreshFactoryMaterialCosts(supabase, affectedNames);
      return Response.json({ deleted: true });
    }

    if (payload.action === "mark-purchase-paid") {
      const purchaseId = n(payload.purchaseId);
      if (!purchaseId) return Response.json({ error: "Falta la factura a marcar como pagada." }, { status: 400 });
      const result = await supabase.from("purchases").update({ payment_status: "pagada" }).eq("id", purchaseId).select("id,payment_status").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return Response.json({ error: "La factura ya no existe." }, { status: 404 });
      return Response.json({ purchase: result.data });
    }

    if (payload.action === "register-purchase" || payload.action === "update-purchase") {
      const purchase = payload.purchase as Row;
      const purchaseId = payload.action === "update-purchase" ? n(payload.purchaseId) : 0;
      const lines = Array.isArray(payload.lines) ? payload.lines as Row[] : [];
      let previouslyAffectedNames: string[] = [];
      if (purchaseId) {
        const previousItems = await supabase.from("purchase_items").select("purchased_products(master_name)").eq("purchase_id", purchaseId);
        if (previousItems.error) throw previousItems.error;
        previouslyAffectedNames = (previousItems.data ?? []).map((item: Row) => String(one(item.purchased_products)?.master_name ?? "")).filter(Boolean);
      }
      if (!purchase?.supplier || !purchase.invoice || !lines.length) return Response.json({ error: "Faltan proveedor, factura o renglones." }, { status: 400 });

      const supplierTaxMode = String(payload.supplierTaxMode).toLowerCase();
      const taxMode = supplierTaxMode.includes("sin") ? "sin_iva" : supplierTaxMode.includes("con") ? "con_iva" : "revisar";
      const supplierResult = await supabase.from("suppliers").upsert({ name: String(purchase.supplier), tax_mode: taxMode, active: true }, { onConflict: "name" }).select().single();
      if (supplierResult.error) throw supplierResult.error;

      const preparedLines: Row[] = [];
      for (const line of lines) {
        const productName = String(line.product ?? "").trim();
        const kind = ["material", "service", "expense"].includes(String(line.kind)) ? String(line.kind) : "material";
        const category = kind === "material" ? "Materia prima" : expenseCategory(line.category);
        const center = String(line.center ?? "Fábrica").trim() || "Fábrica";
        if (!productName) return Response.json({ error: "Todos los renglones deben tener un producto o concepto." }, { status: 400 });

        // Reuse the selected catalog profile for materials, services and expenses.
        const profileResult = await supabase.from("purchased_products").select("*").eq("master_name", productName).eq("active", true).order("last_purchase_at", { ascending: false, nullsFirst: false }).order("id", { ascending: true }).limit(1);
        if (profileResult.error) throw new Error(profileResult.error.message);
        const materialProfile: Row | null = profileResult.data?.[0] ?? null;
        if (!materialProfile) return Response.json({ error: `El insumo o servicio "${productName}" no existe en el catálogo. Crealo antes de cargar la factura.` }, { status: 400 });

        const quantity = n(String(line.quantity ?? 0).replace(",", "."));
        const enteredUnitPrice = parseInvoiceMoney(line.price);
        if (quantity <= 0 || enteredUnitPrice <= 0) return Response.json({ error: `Revisá la cantidad y el precio de "${productName}".` }, { status: 400 });

        const requestedMode = String(line.priceMode ?? "");
        const priceMode = ["included", "excluded", "black"].includes(requestedMode) ? requestedMode : taxMode === "con_iva" ? "excluded" : "black";
        const profileVatRate = kind === "material"
          ? ([0, 10.5, 21].includes(n(materialProfile.vat_rate)) ? n(materialProfile.vat_rate) : 21)
          : ([0, 10.5, 21].includes(n(line.vatRate)) ? n(line.vatRate) : 21);
        const vatRate = priceMode === "black" ? 0 : profileVatRate;
        const unitNet = priceMode === "included" && vatRate > 0 ? enteredUnitPrice / (1 + vatRate / 100) : enteredUnitPrice;
        const unitGross = priceMode === "excluded" ? enteredUnitPrice * (1 + vatRate / 100) : enteredUnitPrice;
        const netLine = roundCurrency(quantity * unitNet);
        const grossLine = roundCurrency(quantity * unitGross);
        const vatAmount = roundCurrency(grossLine - netLine);
        const content = Math.max(0.001, n(line.contentPerPackage) || n(materialProfile.content_per_package) || 1);

        preparedLines.push({
          productName,
          materialProfile,
          kind,
          category,
          center,
          quantity,
          unitNet,
          unitGross,
          vatRate,
          vatAmount,
          netLine,
          grossLine,
          finalUnit: unitGross / content,
        });
      }

      const netTotal = roundCurrency(preparedLines.reduce((sum, line) => sum + n(line.netLine), 0));
      const vatTotal = roundCurrency(preparedLines.reduce((sum, line) => sum + n(line.vatAmount), 0));
      const grossTotal = roundCurrency(preparedLines.reduce((sum, line) => sum + n(line.grossLine), 0));
      const allocations = preparedLines.map((line) => ({ kind: line.kind, category: line.category, center: line.center, description: line.productName, gross: line.grossLine }));
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(purchase.dueDate ?? "")) ? String(purchase.dueDate) : null;
      const encodedCostCenter = PURCHASE_ALLOCATIONS_PREFIX + JSON.stringify({ allocations, dueDate });
      const paymentStatus = String(purchase.payment).toLowerCase().includes("cuenta") ? "cuenta_corriente" : "pagada";
      const purchaseValues = {
        supplier_id: supplierResult.data.id,
        invoice_number: String(purchase.invoice),
        invoice_date: purchase.invoiceDate || today(),
        cost_center: encodedCostCenter,
        payment_status: paymentStatus,
        net_total: netTotal,
        vat_total: vatTotal,
        gross_total: grossTotal,
        created_by: user.id,
      };
      const savedPurchase = purchaseId
        ? await supabase.from("purchases").update(purchaseValues).eq("id", purchaseId).select().single()
        : await supabase.from("purchases").insert(purchaseValues).select().single();
      if (savedPurchase.error) throw savedPurchase.error;
      if (purchaseId) {
        const clearedItems = await supabase.from("purchase_items").delete().eq("purchase_id", purchaseId);
        if (clearedItems.error) throw clearedItems.error;
      }

      const itemResult = await supabase.from("purchase_items").insert(preparedLines.map((line) => ({
        purchase_id: savedPurchase.data.id,
        purchased_product_id: line.materialProfile.id,
        quantity: line.quantity,
        net_package_price: line.unitNet,
        vat_rate: line.vatRate,
        vat_amount: line.vatAmount,
        line_total: line.grossLine,
        final_cost_per_unit: line.finalUnit,
      })));
      if (itemResult.error) throw itemResult.error;

      const affectedNames = Array.from(new Set([...previouslyAffectedNames, ...preparedLines.filter((line) => line.kind === "material").map((line) => String(line.productName))]));
      await refreshFactoryMaterialCosts(supabase, affectedNames);
      return Response.json({ purchase: savedPurchase.data }, { status: purchaseId ? 200 : 201 });
    }

    if (payload.action === "register-customer-payment" || payload.action === "register-customer-adjustment") {
      const entry = (payload.payment ?? payload.movement) as Row;
      let { data: client } = await supabase.from("clients").select("id").eq("name", String(entry.clientName)).maybeSingle();
      if (!client) { const created = await supabase.from("clients").insert({ name: String(entry.clientName), kind: "Cliente" }).select("id").single(); if (created.error) throw created.error; client = created.data; }
      if (payload.action === "register-customer-payment") {
        const result = await supabase.from("customer_payments").insert({ client_id: client.id, payment_date: entry.paymentDate || today(), amount: n(entry.amount), method: String(entry.method ?? "Transferencia"), reference: entry.reference || null, notes: entry.notes || null, created_by: user.id }).select().single();
        if (result.error) throw result.error; return Response.json({ payment: result.data }, { status: 201 });
      }
      const amount = Math.abs(n(entry.amount));
      const result = await supabase.from("customer_account_adjustments").insert({ client_id: client.id, movement_date: entry.movementDate || today(), movement_type: String(entry.movementType).toLowerCase().includes("venta") ? "venta" : "ajuste", concept: String(entry.concept), signed_amount: entry.effect === "decrease" ? -amount : amount, notes: entry.notes || null, created_by: user.id }).select().single();
      if (result.error) throw result.error; return Response.json({ movement: result.data }, { status: 201 });
    }

    if (payload.action === "register-expense" || payload.action === "register-local-sale") {
      const entry = (payload.expense ?? payload.sale) as Row;
      if (payload.action === "register-expense") {
        const allowed = ["servicios","alquileres","sueldos","mantenimiento","inversiones","otros"];
        const category = String(entry.category ?? "otros").toLowerCase();
        const result = await supabase.from("operating_expenses").insert({ expense_date: entry.expenseDate || today(), area: String(entry.area), category: allowed.includes(category) ? category : "otros", concept: String(entry.concept), amount: Math.abs(n(entry.amount)), notes: entry.notes || null, created_by: user.id }).select().single();
        if (result.error) throw result.error; return Response.json({ expense: result.data }, { status: 201 });
      }
      const result = await supabase.from("local_sales").insert({ sale_date: entry.saleDate || today(), area: String(entry.area), concept: String(entry.concept), amount: Math.abs(n(entry.amount)), notes: entry.notes || null, created_by: user.id }).select().single();
      if (result.error) throw result.error; return Response.json({ sale: result.data }, { status: 201 });
    }

    if (payload.action === "save-staff") {
      const staff = payload.staff as Row;
      const role = staff.role === "produccion" ? "maestro_heladero" : staff.role === "encargado" ? "jefe_produccion" : "administracion";
      const result = await supabase.from("profiles").update({ display_name: String(staff.displayName), role, active: staff.active !== false }).eq("email", String(staff.email).toLowerCase()).select().maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return Response.json({ error: "Primero creá o invitá este usuario desde Supabase Authentication." }, { status: 409 });
      return Response.json({ staff: result.data });
    }

    return Response.json({ error: "Operación desconocida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof (error as Row)?.message === "string" ? String((error as Row).message) : "Error inesperado";
    const unauthorized = message === "UNAUTHORIZED" || message === "INACTIVE_USER";
    const duplicate = message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique");
    return Response.json({ error: unauthorized ? "Iniciá sesión para continuar." : duplicate ? "Ese registro ya existe." : message }, { status: unauthorized ? 401 : duplicate ? 409 : 500 });
  }
}

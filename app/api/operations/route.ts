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
    const [unitsResult, dispatchResult, customerPaymentsResult, adjustmentsResult, expensesResult, salesResult, purchasesResult, staffResult, materialsResult, suppliersResult, supplierPaymentsResult, recipesResult] = await Promise.all([
      supabase.from("production_units").select(productionSelect).order("id", { ascending: false }).limit(5000),
      supabase.from("dispatches").select("*, clients(name), dispatch_items(*, production_units(unique_code,weight_kg,units,products(code,name,family,presentation,container)))").order("id", { ascending: false }).limit(5000),
      supabase.from("customer_payments").select("*, clients(name)").order("id", { ascending: false }).limit(500),
      supabase.from("customer_account_adjustments").select("*, clients(name)").order("id", { ascending: false }).limit(500),
      supabase.from("operating_expenses").select("*").order("id", { ascending: false }).limit(5000),
      supabase.from("local_sales").select("*").order("id", { ascending: false }).limit(5000),
      supabase.from("purchases").select("*, suppliers(name), purchase_items(vat_rate,vat_amount)").order("id", { ascending: false }).limit(5000),
      supabase.from("profiles").select("*").order("display_name"),
      supabase.from("purchased_products").select("*, suppliers(id,name)").eq("active", true).order("master_name"),
      supabase.from("suppliers").select("id,name,tax_mode,category,active").eq("active", true).neq("name", "Catálogo interno").order("name"),
      supabase.from("supplier_payments").select("*, suppliers(name)").order("id", { ascending: false }).limit(5000),
      supabase.from("recipes").select("*, products(code,name,family,presentation,container), recipe_items(id,purchased_product_id,quantity_kg,purchased_products(master_name,last_final_cost_per_unit,cost_unit))").eq("active", true).order("name"),
    ]);
    const firstError = [unitsResult, dispatchResult, customerPaymentsResult, adjustmentsResult, expensesResult, salesResult, purchasesResult, staffResult, materialsResult, suppliersResult, supplierPaymentsResult, recipesResult].find((r) => r.error)?.error;
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
      return {
        id: r.id,
        supplierId: r.supplier_id,
        supplierName: one(r.suppliers)?.name ?? "",
        supplier: one(r.suppliers)?.name ?? "",
        invoiceNumber: r.invoice_number,
        invoice: r.invoice_number,
        invoiceDate: r.invoice_date,
        date: new Date(`${r.invoice_date}T12:00:00`).toLocaleDateString("es-AR"),
        costCenter: r.cost_center,
        center: r.cost_center,
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
        detail: `${items.length} ${items.length === 1 ? "producto" : "productos"}`,
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
      const recipeCost = items.reduce((sum: number, item: Row) => sum + n(item.lineCost), 0);
      const yieldKg = n(r.yield_kg);
      return {
        id: r.id,
        productCode: product?.code ?? "",
        productName: product?.name ?? r.name,
        name: r.name,
        yieldKg,
        batch: `${yieldKg.toLocaleString("es-AR", { maximumFractionDigits: 3 })} kg`,
        ingredients: items.length,
        recipe: recipeCost,
        perKg: yieldKg > 0 ? recipeCost / yieldKg : 0,
        updated: new Date(r.updated_at ?? r.created_at).toLocaleDateString("es-AR"),
        items,
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
        return {
          id: r.id,
          name: r.master_name,
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
      financialDispatches: canSeeFinancials ? allDispatches : [],
      staff: (staffResult.data ?? []).map((r: Row) => ({ id: r.id, email: r.email, displayName: r.display_name, role: r.role === "maestro_heladero" ? "produccion" : r.role === "jefe_produccion" ? "encargado" : "administracion", active: r.active })),
      currentUser: { id: profile.id, email: profile.email, displayName: profile.display_name, role, active: profile.active },
      nextUniqueCode: String(lastNumeric + 1).padStart(6, "0"), mode: "supabase",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const unauthorized = message === "UNAUTHORIZED" || message === "INACTIVE_USER";
    return Response.json({ error: unauthorized ? "Iniciá sesión para usar el sistema." : message }, { status: unauthorized ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, profile, supabase } = await context();
    const payload = await request.json() as Row;
    const financial = ["register-purchase", "register-raw-material", "save-supplier", "register-supplier-payment", "save-recipe", "register-customer-payment", "register-customer-adjustment", "register-expense", "register-local-sale", "save-staff"];
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
      const saved = await supabase.from("production_units").insert({
        unique_code: String(record.uniqueCode), product_id: product.id, weight_kg: record.weight == null ? null : n(record.weight),
        units: record.units == null ? null : n(record.units), responsible_id: user.id, created_by: user.id,
        base_price_snapshot: n(record.price), lot: record.lot || null, expires_at: record.expiresAt || null,
      }).select().single();
      if (saved.error) throw saved.error;
      return Response.json({ unit: saved.data }, { status: 201 });
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

    if (payload.action === "save-recipe") {
      const recipe = payload.recipe as Row;
      const productData = recipe?.product as Row;
      const productCode = String(productData?.code ?? recipe?.productCode ?? "").trim();
      const name = String(recipe?.name ?? productData?.name ?? "").trim();
      const yieldKg = n(recipe?.yieldKg);
      const items = Array.isArray(recipe?.items) ? recipe.items as Row[] : [];
      if (!productCode || !name || yieldKg <= 0 || !items.length) return Response.json({ error: "Elegí el producto, indicá el rendimiento y agregá al menos una materia prima." }, { status: 400 });
      if (items.some((item) => n(item.materialId) <= 0 || n(item.quantityKg) <= 0)) return Response.json({ error: "Revisá las materias primas y sus cantidades." }, { status: 400 });

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
        yield_kg: yieldKg,
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

    if (payload.action === "register-raw-material") {
      const material = payload.material as Row;
      const name = String(material?.name ?? "").trim();
      const unit = String(material?.unit ?? "kg") === "unidad" ? "unidad" : "kg";
      const contentPerPackage = n(material?.contentPerPackage);
      const vatRate = [0, 10.5, 21].includes(n(material?.vat)) ? n(material?.vat) : 21;
      if (!name || contentPerPackage <= 0) return Response.json({ error: "Completá el nombre y un contenido por envase mayor a cero." }, { status: 400 });

      const existing = await supabase.from("purchased_products").select("id").ilike("master_name", name).limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return Response.json({ error: "Ya existe una materia prima con ese nombre." }, { status: 409 });

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
        supplier_description: name,
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

    if (payload.action === "register-purchase") {
      const purchase = payload.purchase as Row; const totals = payload.totals as Row;
      const lines = Array.isArray(payload.lines) ? payload.lines as Row[] : [];
      if (!purchase?.supplier || !purchase.invoice || !lines.length) return Response.json({ error: "Faltan proveedor, factura o productos." }, { status: 400 });
      const taxMode = String(payload.supplierTaxMode).toLowerCase().includes("sin") ? "sin_iva" : String(payload.supplierTaxMode).toLowerCase().includes("con") ? "con_iva" : "revisar";
      const supplierResult = await supabase.from("suppliers").upsert({ name: String(purchase.supplier), tax_mode: taxMode }, { onConflict: "name" }).select().single();
      if (supplierResult.error) throw supplierResult.error;
      const paymentStatus = String(purchase.payment).toLowerCase().includes("cuenta") ? "cuenta_corriente" : "pagada";
      const savedPurchase = await supabase.from("purchases").insert({ supplier_id: supplierResult.data.id, invoice_number: String(purchase.invoice), invoice_date: purchase.invoiceDate || today(), cost_center: String(purchase.center ?? "Fábrica"), payment_status: paymentStatus, net_total: n(totals?.net), vat_total: n(totals?.vat), gross_total: n(totals?.gross), created_by: user.id }).select().single();
      if (savedPurchase.error) throw savedPurchase.error;
      for (const line of lines) {
        const productName = String(line.product ?? "").trim();
        const profileResult = await supabase.from("purchased_products").select("*").ilike("master_name", productName).eq("active", true).order("last_purchase_at", { ascending: false, nullsFirst: false }).order("id", { ascending: true }).limit(1);
        if (profileResult.error) throw profileResult.error;
        const materialProfile = profileResult.data?.[0];
        if (!materialProfile) return Response.json({ error: `La materia prima "${productName}" no existe. Creala antes de cargar la factura.` }, { status: 400 });
        const quantity = n(String(line.quantity ?? 0).replace(",", "."));
        const price = n(String(line.price ?? 0).replace(/[^0-9.,-]/g, "").replaceAll(".", "").replace(",", "."));
        const vatRate = taxMode === "con_iva" ? n(line.vatRate) : 0;
        const netLine = quantity * price;
        const content = Math.max(0.001, n(line.contentPerPackage) || n(materialProfile.content_per_package) || 1);
        const finalUnit = price * (1 + vatRate / 100) / content;
        const itemResult = await supabase.from("purchase_items").insert({ purchase_id: savedPurchase.data.id, purchased_product_id: materialProfile.id, quantity, net_package_price: price, vat_rate: vatRate, vat_amount: netLine * vatRate / 100, line_total: netLine * (1 + vatRate / 100), final_cost_per_unit: finalUnit });
        if (itemResult.error) throw itemResult.error;
        const invoiceDate = String(purchase.invoiceDate || today());
        if (!materialProfile.last_purchase_at || invoiceDate >= String(materialProfile.last_purchase_at)) {
          const updateCost = await supabase.from("purchased_products").update({ last_net_package_cost: price, last_final_cost_per_unit: finalUnit, last_purchase_at: invoiceDate }).ilike("master_name", productName);
          if (updateCost.error) throw updateCost.error;
        }
      }
      return Response.json({ purchase: savedPurchase.data }, { status: 201 });
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
    const message = error instanceof Error ? error.message : "Error inesperado";
    const unauthorized = message === "UNAUTHORIZED" || message === "INACTIVE_USER";
    const duplicate = message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique");
    return Response.json({ error: unauthorized ? "Iniciá sesión para continuar." : duplicate ? "Ese registro ya existe." : message }, { status: unauthorized ? 401 : duplicate ? 409 : 500 });
  }
}

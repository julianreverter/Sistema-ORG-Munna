import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { appUsers, customerAccountAdjustments, customerPayments, dispatchItems, dispatches, localSales, operatingExpenses, productionUnits, purchaseItems, purchasedProducts, purchases, suppliers } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

async function authorizedUser() {
  const user = await getChatGPTUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

async function currentAppUser(db: ReturnType<typeof getDb>, user: Awaited<ReturnType<typeof authorizedUser>>) {
  let [appUser] = await db.select().from(appUsers).where(eq(appUsers.email, user.email)).limit(1);
  if (!appUser) {
    const [firstUser] = await db.select().from(appUsers).limit(1);
    [appUser] = await db.insert(appUsers).values({ email: user.email, displayName: user.displayName, role: firstUser ? "produccion" : "administracion" }).returning();
  }
  if (!appUser.active) throw new Error("INACTIVE_USER");
  return appUser;
}

export async function GET() {
  try {
    const user = await authorizedUser();
    const db = getDb();
    const appUser = await currentAppUser(db, user);
    let [latestUnit] = await db.select({ uniqueCode: productionUnits.uniqueCode }).from(productionUnits).orderBy(desc(productionUnits.id)).limit(1);
    if (!latestUnit) {
      await db.insert(productionUnits).values([
        { uniqueCode: "004528", productCode: "230", productName: "Chocolate Münna B.G", container: "Balde retornable", weightKg: 7.155, units: null, responsible: "Datos de prueba", family: "Helado", presentation: "Balde grande", basePriceSnapshot: 27000, status: "stock", createdByEmail: user.email },
        { uniqueCode: "004527", productCode: "214", productName: "Pistacho Vaq.", container: "Vasqueta", weightKg: 3.48, units: null, responsible: "Datos de prueba", family: "Helado", presentation: "Vasqueta", basePriceSnapshot: 30000, status: "stock", createdByEmail: user.email },
        { uniqueCode: "CAJ00084", productCode: "1002", productName: "Alfajor Helado Americana", container: "Caja", weightKg: null, units: 20, responsible: "Datos de prueba", family: "Postre congelado", presentation: "Caja x 20", basePriceSnapshot: 40000, status: "stock", createdByEmail: user.email },
      ]).onConflictDoNothing();
      [latestUnit] = await db.select({ uniqueCode: productionUnits.uniqueCode }).from(productionUnits).orderBy(desc(productionUnits.id)).limit(1);
    }
    const stock = await db.select().from(productionUnits).where(eq(productionUnits.status, "stock")).orderBy(desc(productionUnits.id)).limit(1000);
    const productionHistory = await db.select({ id: productionUnits.id, uniqueCode: productionUnits.uniqueCode, productCode: productionUnits.productCode, productName: productionUnits.productName, presentation: productionUnits.presentation, container: productionUnits.container, weightKg: productionUnits.weightKg, units: productionUnits.units, responsible: productionUnits.responsible, status: productionUnits.status, costPerKgSnapshot: productionUnits.costPerKgSnapshot, producedAt: productionUnits.createdAt, dispatchedAt: productionUnits.dispatchedAt, remittanceNumber: dispatches.remittanceNumber, clientName: dispatches.clientName }).from(productionUnits).leftJoin(dispatchItems, eq(dispatchItems.productionUnitId, productionUnits.id)).leftJoin(dispatches, eq(dispatches.id, dispatchItems.dispatchId)).orderBy(desc(productionUnits.id)).limit(5000);
    const recentDispatches = await db.select().from(dispatches).orderBy(desc(dispatches.id)).limit(50);
    const recentCustomerPayments = await db.select().from(customerPayments).orderBy(desc(customerPayments.id)).limit(500);
    const recentCustomerAdjustments = await db.select().from(customerAccountAdjustments).orderBy(desc(customerAccountAdjustments.id)).limit(500);
    const expenses = await db.select().from(operatingExpenses).orderBy(desc(operatingExpenses.id)).limit(5000);
    const sales = await db.select().from(localSales).orderBy(desc(localSales.id)).limit(5000);
    const purchaseRows = await db.select().from(purchases).orderBy(desc(purchases.id)).limit(5000);
    const financialDispatches = await db.select().from(dispatches).orderBy(desc(dispatches.id)).limit(5000);
    const staff = await db.select().from(appUsers).orderBy(appUsers.displayName);
    const lastNumericCode = Number(latestUnit?.uniqueCode ?? 4529);
    const nextUniqueCode = String(Number.isFinite(lastNumericCode) ? Math.max(4530, lastNumericCode + 1) : 4530).padStart(6, "0");
    const canSeeFinancials = appUser.role === "administracion";
    const canSeeProductionCosts = appUser.role === "administracion" || appUser.role === "encargado";
    return Response.json({ stock, productionHistory: canSeeProductionCosts ? productionHistory : productionHistory.map(({ costPerKgSnapshot: _cost, ...row }) => row), recentDispatches: appUser.role === "produccion" ? [] : recentDispatches, customerPayments: canSeeFinancials ? recentCustomerPayments : [], customerAdjustments: canSeeFinancials ? recentCustomerAdjustments : [], operatingExpenses: canSeeFinancials ? expenses : [], localSales: canSeeFinancials ? sales : [], purchases: canSeeFinancials ? purchaseRows : [], financialDispatches: canSeeFinancials ? financialDispatches : [], staff, currentUser: appUser, nextUniqueCode, mode: "persistent" });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
    return Response.json({ error: unauthorized ? "Iniciá sesión para usar el sistema." : "No se pudo leer la base de datos." }, { status: unauthorized ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await authorizedUser();
    const payload = await request.json() as Record<string, unknown>;
    const db = getDb();
    const appUser = await currentAppUser(db, user);
    const financialActions = ["register-purchase", "register-customer-payment", "register-customer-adjustment", "register-expense", "register-local-sale"];
    if (financialActions.includes(String(payload.action)) && appUser.role !== "administracion") return Response.json({ error: "No tenés permiso para acceder a información financiera." }, { status: 403 });

    if (payload.action === "register-production") {
      const record = payload.record as Record<string, unknown> | undefined;
      if (!record?.uniqueCode || !record.productCode || !record.productName) return Response.json({ error: "Faltan datos de producción." }, { status: 400 });
      const [saved] = await db.insert(productionUnits).values({
        uniqueCode: String(record.uniqueCode), productCode: String(record.productCode), productName: String(record.productName),
        container: String(record.container ?? ""), weightKg: record.weight == null ? null : Number(record.weight), units: record.units == null ? null : Number(record.units),
        responsible: String(record.responsible ?? user.displayName), family: String(record.family ?? ""), presentation: String(record.presentation ?? ""),
        basePriceSnapshot: Number(record.price ?? 0), createdByEmail: user.email,
      }).returning();
      return Response.json({ unit: saved }, { status: 201 });
    }

    if (payload.action === "create-dispatch") {
      const codes = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
      const client = payload.client as Record<string, unknown> | undefined;
      if (!codes.length || !client?.id || !client.name) return Response.json({ error: "Faltan cliente o productos." }, { status: 400 });
      const units = await db.select().from(productionUnits).where(and(inArray(productionUnits.uniqueCode, codes), eq(productionUnits.status, "stock")));
      if (units.length !== codes.length) return Response.json({ error: "Uno o más códigos ya no están disponibles en stock." }, { status: 409 });
      const discounts = (client.discounts ?? {}) as Record<string, number>;
      const lines = units.map((unit) => {
        const discount = Number(discounts[unit.family.toLowerCase()] ?? discounts.helado ?? 0);
        const quantity = unit.weightKg ?? unit.units ?? 0;
        const subtotal = quantity * unit.basePriceSnapshot;
        return { unit, discount, subtotal, total: subtotal * (1 - discount / 100) };
      });
      const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
      const total = lines.reduce((sum, line) => sum + line.total, 0);
      const remittanceNumber = `R-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;
      const [dispatch] = await db.insert(dispatches).values({ remittanceNumber, clientId: Number(client.id), clientName: String(client.name), totalKg: units.reduce((sum, unit) => sum + (unit.weightKg ?? 0), 0), subtotal, discountTotal: subtotal - total, total, createdByEmail: user.email }).returning();
      await db.insert(dispatchItems).values(lines.map((line) => ({ dispatchId: dispatch.id, productionUnitId: line.unit.id, uniqueCode: line.unit.uniqueCode, productName: line.unit.productName, weightKg: line.unit.weightKg, units: line.unit.units, unitPrice: line.unit.basePriceSnapshot, discountPct: line.discount, lineTotal: line.total })));
      await db.update(productionUnits).set({ status: "dispatched", dispatchedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(inArray(productionUnits.uniqueCode, codes));
      return Response.json({ dispatch }, { status: 201 });
    }

    if (payload.action === "register-purchase") {
      const purchase = payload.purchase as Record<string, unknown> | undefined;
      const totals = payload.totals as Record<string, unknown> | undefined;
      const lines = Array.isArray(payload.lines) ? payload.lines as Array<Record<string, unknown>> : [];
      if (!purchase?.supplier || !purchase.invoice || !lines.length) return Response.json({ error: "Faltan proveedor, factura o productos." }, { status: 400 });
      await db.insert(suppliers).values({ name: String(purchase.supplier), taxMode: String(payload.supplierTaxMode ?? "revisar") }).onConflictDoNothing();
      const [supplier] = await db.select().from(suppliers).where(eq(suppliers.name, String(purchase.supplier))).limit(1);
      if (!supplier) return Response.json({ error: "No se pudo crear el proveedor." }, { status: 500 });
      const [savedPurchase] = await db.insert(purchases).values({
        supplierId: supplier.id, invoiceNumber: String(purchase.invoice), invoiceDate: new Date().toISOString().slice(0, 10),
        costCenter: String(purchase.center ?? "Fábrica"), paymentStatus: String(purchase.payment ?? "Cuenta corriente"),
        netTotal: Number(totals?.net ?? 0), vatTotal: Number(totals?.vat ?? 0), grossTotal: Number(totals?.gross ?? 0), createdByEmail: user.email,
      }).returning();
      for (const line of lines) {
        const productName = String(line.product ?? "");
        let [profile] = await db.select().from(purchasedProducts).where(and(eq(purchasedProducts.supplierId, supplier.id), eq(purchasedProducts.masterName, productName))).limit(1);
        if (!profile) [profile] = await db.insert(purchasedProducts).values({ masterName: productName, supplierId: supplier.id, supplierDescription: productName, costUnit: String(line.costUnit ?? "kg"), contentPerPackage: Number(line.contentPerPackage ?? 1), vatRate: Number(line.vatRate ?? 0) }).returning();
        const quantity = Number(String(line.quantity ?? "0").replace(",", "."));
        const netPackagePrice = Number(String(line.price ?? "0").replace(/\D/g, ""));
        const vatRate = String(payload.supplierTaxMode) === "Con IVA" ? Number(line.vatRate ?? 0) : 0;
        const netLine = quantity * netPackagePrice;
        await db.insert(purchaseItems).values({ purchaseId: savedPurchase.id, purchasedProductId: profile.id, quantity, netPackagePrice, vatRate, vatAmount: netLine * vatRate / 100, lineTotal: netLine * (1 + vatRate / 100), finalCostPerUnit: netPackagePrice * (1 + vatRate / 100) / Math.max(1, Number(line.contentPerPackage ?? 1)) });
        await db.update(purchasedProducts).set({ lastNetPackageCost: netPackagePrice, lastFinalCostPerUnit: netPackagePrice * (1 + vatRate / 100) / Math.max(1, Number(line.contentPerPackage ?? 1)), lastPurchaseAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(purchasedProducts.id, profile.id));
      }
      return Response.json({ purchase: savedPurchase }, { status: 201 });
    }

    if (payload.action === "register-customer-payment") {
      const payment = payload.payment as Record<string, unknown> | undefined;
      if (!payment?.clientId || !payment.clientName || !Number(payment.amount)) return Response.json({ error: "Faltan cliente o importe." }, { status: 400 });
      const [savedPayment] = await db.insert(customerPayments).values({
        clientId: Number(payment.clientId), clientName: String(payment.clientName), paymentDate: String(payment.paymentDate ?? new Date().toISOString().slice(0, 10)),
        amount: Number(payment.amount), method: String(payment.method ?? "Transferencia"), reference: payment.reference ? String(payment.reference) : null,
        notes: payment.notes ? String(payment.notes) : null, createdByEmail: user.email,
      }).returning();
      return Response.json({ payment: savedPayment }, { status: 201 });
    }

    if (payload.action === "save-staff") {
      if (appUser.role !== "administracion") return Response.json({ error: "Sólo Administración puede gestionar personal y permisos." }, { status: 403 });
      const staff = payload.staff as Record<string, unknown> | undefined;
      const role = String(staff?.role ?? "produccion");
      if (!staff?.email || !staff.displayName || !["produccion", "encargado", "administracion"].includes(role)) return Response.json({ error: "Completá nombre, correo y rol." }, { status: 400 });
      await db.insert(appUsers).values({ email: String(staff.email).toLowerCase(), displayName: String(staff.displayName), role, active: staff.active !== false }).onConflictDoUpdate({ target: appUsers.email, set: { displayName: String(staff.displayName), role, active: staff.active !== false, updatedAt: new Date().toISOString() } });
      const allStaff = await db.select().from(appUsers).orderBy(appUsers.displayName);
      return Response.json({ staff: allStaff });
    }

    if (payload.action === "register-customer-adjustment") {
      const movement = payload.movement as Record<string, unknown> | undefined;
      const amount = Math.abs(Number(movement?.amount ?? 0));
      if (!movement?.clientId || !movement.clientName || !movement.concept || !amount) return Response.json({ error: "Completá cliente, concepto e importe." }, { status: 400 });
      const signedAmount = String(movement.effect) === "decrease" ? -amount : amount;
      const [savedMovement] = await db.insert(customerAccountAdjustments).values({ clientId: Number(movement.clientId), clientName: String(movement.clientName), movementDate: String(movement.movementDate ?? new Date().toISOString().slice(0, 10)), movementType: String(movement.movementType ?? "Ajuste"), concept: String(movement.concept), signedAmount, notes: movement.notes ? String(movement.notes) : null, createdByEmail: user.email }).returning();
      return Response.json({ movement: savedMovement }, { status: 201 });
    }

    if (payload.action === "register-expense") {
      const expense = payload.expense as Record<string, unknown> | undefined;
      if (!expense?.area || !expense.category || !expense.concept || !Number(expense.amount)) return Response.json({ error: "Completá área, categoría, concepto e importe." }, { status: 400 });
      const [savedExpense] = await db.insert(operatingExpenses).values({ expenseDate: String(expense.expenseDate ?? new Date().toISOString().slice(0, 10)), area: String(expense.area), category: String(expense.category), concept: String(expense.concept), amount: Math.abs(Number(expense.amount)), notes: expense.notes ? String(expense.notes) : null, createdByEmail: user.email }).returning();
      return Response.json({ expense: savedExpense }, { status: 201 });
    }

    if (payload.action === "register-local-sale") {
      const sale = payload.sale as Record<string, unknown> | undefined;
      if (!sale?.area || !sale.concept || !Number(sale.amount)) return Response.json({ error: "Completá área, concepto e importe." }, { status: 400 });
      const [savedSale] = await db.insert(localSales).values({ saleDate: String(sale.saleDate ?? new Date().toISOString().slice(0, 10)), area: String(sale.area), concept: String(sale.concept), amount: Math.abs(Number(sale.amount)), notes: sale.notes ? String(sale.notes) : null, createdByEmail: user.email }).returning();
      return Response.json({ sale: savedSale }, { status: 201 });
    }

    return Response.json({ error: "Operación desconocida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const unauthorized = message === "UNAUTHORIZED" || message === "INACTIVE_USER";
    const duplicate = message.toLowerCase().includes("unique");
    return Response.json({ error: unauthorized ? "Iniciá sesión para continuar." : duplicate ? "Ese código ya fue registrado." : message }, { status: unauthorized ? 401 : duplicate ? 409 : 500 });
  }
}

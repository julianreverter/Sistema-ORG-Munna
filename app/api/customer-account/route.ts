import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { currentFormulaCosts } from "@/lib/customer-costs";

export const dynamic = "force-dynamic";
type Row = Record<string, any>;
async function allRows(page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) {
  const result: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await page(offset, offset + 499);
    if (error) throw new Error(error.message);
    result.push(...(data ?? []));
    if (!data || data.length < 500) return result;
  }
}
export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Iniciá sesión para continuar." }, { status: 401 });
    const db = await createServerSupabaseClient();
    const { data: profile, error: profileError } = await db.from("profiles").select("role,active").eq("id", user.id).single();
    if (profileError || !profile?.active || profile.role !== "administracion") return Response.json({ error: "Sólo Administración puede consultar cuentas corrientes." }, { status: 403 });
    const clientId = Number(new URL(request.url).searchParams.get("clientId"));
    if (!Number.isSafeInteger(clientId) || clientId <= 0) return Response.json({ error: "Seleccioná un cliente." }, { status: 400 });
    const [dispatches, payments, adjustments, items, recipes, links, materials] = await Promise.all([
      allRows((from, to) => db.from("dispatches").select("id,client_id,remittance_number,total_kg,total,created_at").eq("client_id", clientId).order("id").range(from, to)),
      allRows((from, to) => db.from("customer_payments").select("*").eq("client_id", clientId).order("id").range(from, to)),
      allRows((from, to) => db.from("customer_account_adjustments").select("*").eq("client_id", clientId).order("id").range(from, to)),
      allRows((from, to) => db.from("dispatch_items").select("id,dispatch_id,weight_kg,units,production_units(product_id,cost_per_kg_snapshot),dispatches!inner(client_id)").eq("dispatches.client_id", clientId).order("id").range(from, to)),
      allRows((from, to) => db.from("recipes").select("id,product_id,yield_kg,recipe_items(quantity_kg,purchased_products(master_name,last_final_cost_per_unit))").eq("active", true).order("id").range(from, to)),
      allRows((from, to) => db.from("recipe_formula_items").select("recipe_id,component_recipe_id,quantity_kg").order("recipe_id").order("component_recipe_id").range(from, to)),
      allRows((from, to) => db.from("purchased_products").select("id,master_name,last_final_cost_per_unit,last_purchase_at").eq("active", true).order("id").range(from, to)),
    ]);
    const currentCosts = currentFormulaCosts(recipes, links, materials);
    const costByDispatch = new Map<number, { cost: number; missing: number; estimated: number }>();
    for (const item of items) {
      const unit = Array.isArray(item.production_units) ? item.production_units[0] : item.production_units;
      const cost = costByDispatch.get(Number(item.dispatch_id)) ?? { cost: 0, missing: 0, estimated: 0 };
      const perKg = unit?.cost_per_kg_snapshot ?? currentCosts.get(Number(unit?.product_id));
      if (item.weight_kg == null || perKg == null) cost.missing++;
      else {
        cost.cost += Number(item.weight_kg) * Number(perKg);
        if (unit?.cost_per_kg_snapshot == null) cost.estimated++;
      }
      costByDispatch.set(Number(item.dispatch_id), cost);
    }
    return Response.json({
      recentDispatches: dispatches.map((row) => { const cost = costByDispatch.get(Number(row.id)); return { id: row.id, clientId: row.client_id, remittanceNumber: row.remittance_number, totalKg: Number(row.total_kg), total: Number(row.total), createdAt: row.created_at, productionCost: Math.round((cost?.cost ?? 0) * 100) / 100, missingCostLines: cost?.missing ?? 1, estimatedCostLines: cost?.estimated ?? 0 }; }),
      customerPayments: payments.map((row) => ({ id: row.id, clientId: row.client_id, paymentDate: row.payment_date, amount: Number(row.amount), method: row.method, reference: row.reference, notes: row.notes, createdAt: row.created_at })),
      customerAdjustments: adjustments.map((row) => ({ id: row.id, clientId: row.client_id, movementDate: row.movement_date, movementType: row.movement_type, concept: row.concept, signedAmount: Number(row.signed_amount), notes: row.notes, createdAt: row.created_at })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("customer-account", error);
    return Response.json({ error: "No se pudo cargar la cuenta completa. Intentá nuevamente." }, { status: 500 });
  }
}

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkAmount, checkInputError } from "@/lib/issued-checks";

async function adminContext() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: Response.json({ error: "Ingresá al sistema para continuar." }, { status: 401 }) };
  const { data: profile, error } = await supabase.from("profiles").select("role,active").eq("id", user.id).single();
  if (error || !profile?.active || profile.role !== "administracion") return { response: Response.json({ error: "Solo Administración puede gestionar cheques." }, { status: 403 }) };
  return { supabase, user };
}

export async function GET() {
  try {
    const ctx = await adminContext();
    if (ctx.response) return ctx.response;
    // Explicit pagination avoids the Data API's default row cap in financial totals.
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await ctx.supabase.from("issued_checks").select("*").order("due_on").order("id").range(offset, offset + 499);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 500) break;
    }
    return Response.json({ checks: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "No se pudieron cargar los cheques. Volvé a intentar." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    if (ctx.response) return ctx.response;
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return Response.json({ error: "Datos inválidos." }, { status: 400 });
    const validation = checkInputError(input);
    if (validation) return Response.json({ error: validation }, { status: 400 });
    const row = {
      number: input.number.trim(), bank: input.bank.trim(), beneficiary: input.beneficiary.trim(),
      amount: checkAmount(input.amount), issued_on: input.issued_on, due_on: input.due_on,
      status: input.status, debited_on: input.status === "debited" ? input.debited_on : null,
      notes: input.notes.trim(),
    };
    const result = input.id
      ? await ctx.supabase.from("issued_checks").update(row).eq("id", input.id).eq("updated_at", input.updated_at).select().maybeSingle()
      : await ctx.supabase.from("issued_checks").insert({ ...row, created_by: ctx.user.id }).select().single();
    if (result.error?.code === "23505") return Response.json({ error: "Ya existe un cheque con ese número y banco." }, { status: 409 });
    if (result.error) throw result.error;
    if (!result.data) return Response.json({ error: "El cheque cambió desde que lo abriste. Actualizá el listado antes de guardar." }, { status: 409 });
    return Response.json({ check: result.data });
  } catch {
    return Response.json({ error: "No se pudo guardar el cheque. Revisá los datos y volvé a intentar." }, { status: 500 });
  }
}

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const cookieName = "munna_order_access";
const response = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function portalClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function context(request: Request) {
  const portal = new URL(request.url).searchParams.get("portal") === "1";
  if (portal) {
    const token = (await cookies()).get(cookieName)?.value;
    if (!token) throw new Error("Abrí el enlace privado que te compartió Münna.");
    return { supabase: portalClient(), token };
  }
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Iniciá sesión en el sistema.");
  return { supabase, token: null };
}

export async function GET(request: Request) {
  try {
    const { supabase, token } = await context(request);
    const result = await supabase.rpc("orders_workspace", { p_token: token });
    if (result.error) throw new Error(result.error.message);
    return response(result.data);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "No se pudieron cargar los pedidos." }, 400);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || new URL(origin).host !== host) return response({ error: "Origen no permitido." }, 403);
  try {
    const bodyText = await request.text();
    if (bodyText.length > 50000) return response({ error: "El pedido es demasiado grande." }, 413);
    const body = JSON.parse(bodyText);
    if (body.action === "enter") {
      if (typeof body.token !== "string" || !/^[0-9a-f]{64}$/.test(body.token)) throw new Error("El enlace de acceso es inválido.");
      const result = await portalClient().rpc("orders_workspace", { p_token: body.token });
      if (result.error) throw new Error(result.error.message);
      (await cookies()).set(cookieName, body.token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict",
        path: "/api/orders", maxAge: 60 * 60 * 24 * 365,
      });
      return response({ ok: true });
    }
    if (body.action === "exit") {
      (await cookies()).set(cookieName, "", { path: "/api/orders", maxAge: 0 });
      return response({ ok: true });
    }
    const { supabase, token } = await context(request);
    if (body.action === "access") {
      if (token) throw new Error("Acceso no autorizado.");
      const result = await supabase.rpc("orders_manage_access", { p_client: body.clientId, p_revoke: body.revoke === true });
      if (result.error) throw new Error(result.error.message);
      return response({ token: result.data });
    }
    if (body.action !== "save") throw new Error("Operación inválida.");
    const result = await supabase.rpc("orders_save", {
      p_token: token, p_id: body.id, p_items: body.items,
      p_revision: body.revision ?? null, p_cancel: body.cancel === true,
      p_note: body.note ?? "", p_date: body.requestedDate || null,
    });
    if (result.error) throw new Error(result.error.message);
    return response({ ok: true });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "No se pudo guardar el pedido." }, 400);
  }
}

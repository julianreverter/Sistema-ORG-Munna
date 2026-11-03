export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok", service: "Sistema ORG Münna", version: "dispatch-unit-prices-2026-11-03-1" });
}

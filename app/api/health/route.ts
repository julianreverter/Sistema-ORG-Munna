export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok", service: "Sistema ORG Münna", version: "product-weight-presentation-2026-11-02-1" });
}

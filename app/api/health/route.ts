export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok", service: "Sistema ORG Münna", version: "checks-calendar-2026-11-05-1" });
}

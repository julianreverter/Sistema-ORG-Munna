import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ChatGPTUser = { id: string; displayName: string; email: string; fullName: string | null };

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const fullName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : null;
  return { id: user.id, email: user.email, fullName, displayName: fullName ?? user.email };
}

export async function requireChatGPTUser(returnTo = "/"): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export function chatGPTSignInPath(returnTo = "/") { return `/login?returnTo=${encodeURIComponent(returnTo)}`; }
export function chatGPTSignOutPath() { return "/login"; }

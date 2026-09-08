import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccess } from "@/lib/access";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getAccess();
  if (!access) return new Response(null, { status: 401 });
  const { id } = await params;
  const db = await createClient();
  const { data: p } = await db
    .from("profiles")
    .select("avatar_path")
    .eq("id", id)
    .maybeSingle();
  if (!p || (id !== access.id && !access.pages.accounts))
    return new Response(null, { status: 404 });
  const { data, error } = await createAdminClient()
    .storage.from("profile-photos")
    .download(p.avatar_path);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": data.type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccess } from "@/lib/access";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getAccess();
  if (!access) return new Response(null, { status: 401 });
  const { id } = await params;
  const db = await createClient();
  const reviewId = new URL(request.url).searchParams.get("request");
  let reviewedPhoto: string | undefined;
  if (reviewId !== null) {
    if (!/^[1-9][0-9]*$/.test(reviewId) || !access.pages.approvals) return new Response(null, { status: 404 });
    const { data: review } = await db.from("approval_requests").select("proposed_data").eq("id", reviewId).eq("request_type", "profile_change").eq("target_id", id).maybeSingle();
    if (!review || typeof review.proposed_data?.avatar !== "string" || !review.proposed_data.avatar.startsWith(`${id}/`)) return new Response(null, { status: 404 });
    reviewedPhoto = review.proposed_data.avatar;
  }
  const { data: p } = await db
    .from("profiles")
    .select("avatar_path")
    .eq("id", id)
    .maybeSingle();
  if (!reviewedPhoto && (!p || (id !== access.id && !access.pages.accounts)))
    return new Response(null, { status: 404 });
  const { data, error } = await createAdminClient()
    .storage.from("profile-photos")
    .download(reviewedPhoto ?? p!.avatar_path);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": data.type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { ReviewProvider } from "@/components/review-provider";
import { Shell } from "@/components/shell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: claimData } = await supabase.auth.getClaims();
  const userId = claimData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("employee_name, username, erp_role, status")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.status !== "active")
    redirect("/login?account=unavailable");

  return (
    <ReviewProvider>
      <Shell
        authenticatedUser={{
          employeeName: profile.employee_name,
          username: profile.username,
          role: profile.erp_role,
        }}
      >
        {children}
      </Shell>
    </ReviewProvider>
  );
}

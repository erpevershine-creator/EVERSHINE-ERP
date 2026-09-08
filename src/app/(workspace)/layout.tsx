import { ReviewProvider } from "@/components/review-provider";
import { Shell } from "@/components/shell";
import { requireAccess } from "@/lib/access";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireAccess();

  return (
    <ReviewProvider>
      <Shell authenticatedUser={access} allowedPages={access.pages}>
        {children}
      </Shell>
    </ReviewProvider>
  );
}

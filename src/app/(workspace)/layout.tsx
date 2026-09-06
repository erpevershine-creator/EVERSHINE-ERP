import { ReviewProvider } from "@/components/review-provider";
import { Shell } from "@/components/shell";
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ReviewProvider>
      <Shell>{children}</Shell>
    </ReviewProvider>
  );
}

import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <h1>Page not found</h1>
      <Link href="/dashboard" className="button primary">
        Return to workspace
      </Link>
    </main>
  );
}

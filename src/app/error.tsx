"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>This page could not load</h1>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}

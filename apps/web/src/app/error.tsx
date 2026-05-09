// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="main">
      <section className="empty-state">
        <strong>Something went sideways</strong>
        <p>The local web shell hit a render error. Try reloading the route.</p>
        <button className="action-button" onClick={reset} type="button">
          Retry
        </button>
      </section>
    </main>
  );
}

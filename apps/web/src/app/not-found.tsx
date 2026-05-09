// SPDX-License-Identifier: AGPL-3.0-or-later

export default function NotFound() {
  return (
    <main className="main">
      <section className="empty-state">
        <strong>Page not found</strong>
        <p>This local route does not exist.</p>
        <a className="action-button" href="/">
          Back to app
        </a>
      </section>
    </main>
  );
}

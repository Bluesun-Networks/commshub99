// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Database,
  Inbox,
  MessageSquareText,
  Radio,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const readinessRows = [
  { area: "Workspace", owner: "core", state: "Ready", tone: "ready" },
  { area: "Database", owner: "packages/db", state: "Ready", tone: "ready" },
  { area: "Auth", owner: "packages/auth", state: "Next", tone: "waiting" },
  { area: "iMessage", owner: "adapters/imessage", state: "Queued", tone: "waiting" },
];

const nextTasks = [
  {
    detail: "Email/password sessions backed by the hub database.",
    icon: <ShieldCheck aria-hidden size={19} />,
    title: "Wire better-auth",
    tone: "warn",
  },
  {
    detail: "Conversation, message, participant, attachment, draft.",
    icon: <MessageSquareText aria-hidden size={19} />,
    title: "Define channel types",
    tone: "warn",
  },
  {
    detail: "Read-only access to imsg-agent SQLite fixtures first.",
    icon: <Database aria-hidden size={19} />,
    title: "Connect iMessage read model",
    tone: "warn",
  },
];

function StatusBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

export default function Home() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Radio aria-hidden size={18} />
          </span>
          <span>commshub99</span>
        </div>

        <nav className="nav" aria-label="Primary">
          <a className="nav-item" href="/" aria-current="page" title="Overview">
            <Inbox aria-hidden size={19} />
            <span className="nav-label">Overview</span>
          </a>
          <a className="nav-item" href="/" title="Approvals">
            <ClipboardCheck aria-hidden size={19} />
            <span className="nav-label">Approvals</span>
          </a>
          <a className="nav-item" href="/" title="People">
            <UsersRound aria-hidden size={19} />
            <span className="nav-label">People</span>
          </a>
          <a className="nav-item" href="/" title="Settings">
            <Settings aria-hidden size={19} />
            <span className="nav-label">Settings</span>
          </a>
        </nav>

        <div className="sidebar-footer">
          <span>Local-first</span>
          <span>AGPL-3.0-or-later</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="page-title">
            <h1>Operations</h1>
            <span>Foundations and read-only browse</span>
          </div>
          <fieldset className="mode-toggle">
            <legend className="sr-only">Interface mode</legend>
            <button type="button" aria-pressed="true">
              Essentials
            </button>
            <button type="button" aria-pressed="false">
              Power
            </button>
          </fieldset>
        </header>

        <div className="dashboard">
          <section className="section" aria-labelledby="readiness-heading">
            <div className="metric-grid">
              <div className="metric">
                <span>Pending approvals</span>
                <strong>0</strong>
              </div>
              <div className="metric">
                <span>Connected channels</span>
                <strong>0</strong>
              </div>
              <div className="metric">
                <span>Database tasks</span>
                <strong>4/4</strong>
              </div>
            </div>

            <div className="section-heading">
              <h2 id="readiness-heading">Readiness</h2>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Area</th>
                    <th scope="col">Owner</th>
                    <th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {readinessRows.map((row) => (
                    <tr key={row.area}>
                      <td>{row.area}</td>
                      <td>{row.owner}</td>
                      <td>
                        <StatusBadge tone={row.tone}>
                          {row.tone === "ready" ? (
                            <CheckCircle2 aria-hidden size={15} />
                          ) : (
                            <CircleDashed aria-hidden size={15} />
                          )}
                          {row.state}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section" aria-labelledby="queue-heading">
            <div className="section-heading">
              <h2 id="queue-heading">Queue</h2>
            </div>
            <div className="panel">
              <ul className="task-list">
                {nextTasks.map((task) => (
                  <li className="task" key={task.title}>
                    <span className={`icon-${task.tone}`}>{task.icon}</span>
                    <span>
                      <strong>{task.title}</strong>
                      <span>{task.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

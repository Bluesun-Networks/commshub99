// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import type { PublicUser } from "@commshub99/auth";
import type { Conversation, ProposedMessage as DraftProposal } from "@commshub99/core";
import {
  Bell,
  BriefcaseBusiness,
  Cake,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Database,
  Download,
  Eye,
  FileDown,
  FileUp,
  Filter,
  History,
  ImagePlus,
  Inbox,
  LogOut,
  Mail,
  MessageCircle,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mode = "essentials" | "power";
type View =
  | "overview"
  | "conversations"
  | "contacts"
  | "approvals"
  | "context"
  | "people"
  | "settings";
type Tone = "ready" | "waiting" | "warn";
type ContactPoint = {
  kind: string;
  label: string;
  value: string;
};
type Contact = {
  birthday: string;
  categories: string[];
  conversationCount: number;
  displayName: string;
  emailPoints: ContactPoint[];
  familyName: string;
  givenName: string;
  id: string;
  notes: string;
  organizationName: string;
  organizationTitle: string;
  phonePoints: ContactPoint[];
  photoUrl: string | null;
  updatedAt: string;
};
type ScheduledSendView = {
  attempts: number;
  channelId: string;
  createdAt: string;
  draftId: string;
  id: string;
  lastError: string | null;
  requestedByUserId: string | null;
  sendAt: string;
  status: string;
  tenantId: string;
  updatedAt: string;
};
type ContextRecordView = {
  allowedPersonalDetails: string[];
  channelId?: string;
  contactKey?: string;
  customPersonalDetails: string[];
  customPrompt: string;
  displayName: string;
  id: string;
  notes: string;
  relationship: string;
  replyPosture: string;
  roomKey?: string;
  tenantId: string;
  tone: string;
  updatedAt: string;
};
type ContextSuggestionView = {
  confidence: number;
  contextType: "contact" | "conversation";
  evidence: Array<{ rowid: number; snippet: string }>;
  payload: {
    allowedPersonalDetails: string[];
    customPrompt: string;
    displayName: string;
    relationship: string;
    replyPosture: string;
    tone: string;
  };
  source: "harvest";
  targetKey: string;
};
type ContextDataView = {
  contactContexts: ContextRecordView[];
  conversationContexts: ContextRecordView[];
  harvestError: string | null;
  suggestions: ContextSuggestionView[];
  tenantId: string;
};
type ReviewWindowId = "day" | "48h" | "week" | "month" | "year";
const holdConfirmMs = 1200;

const readinessRows = [
  { area: "Workspace", owner: "core", state: "Ready", tone: "ready" },
  { area: "Database", owner: "packages/db", state: "Ready", tone: "ready" },
  { area: "Auth", owner: "packages/auth", state: "Next", tone: "waiting" },
  { area: "iMessage", owner: "adapters/imessage", state: "Queued", tone: "waiting" },
] satisfies Array<{ area: string; owner: string; state: string; tone: Tone }>;

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
] satisfies Array<{ detail: string; icon: ReactNode; title: string; tone: "warn" }>;

const navItems = [
  { icon: <Inbox aria-hidden size={19} />, label: "Overview", view: "overview" },
  { icon: <MessageCircle aria-hidden size={19} />, label: "Conversations", view: "conversations" },
  { icon: <UsersRound aria-hidden size={19} />, label: "Contacts", view: "contacts" },
  { icon: <ClipboardCheck aria-hidden size={19} />, label: "Approvals", view: "approvals" },
  { icon: <Tag aria-hidden size={19} />, label: "Context", view: "context" },
  { icon: <UserPlus aria-hidden size={19} />, label: "People", view: "people" },
  { icon: <Settings aria-hidden size={19} />, label: "Settings", view: "settings" },
] satisfies Array<{ icon: ReactNode; label: string; view: View }>;

const defaultReviewWindow = {
  id: "day",
  label: "Last day",
  durationMs: 24 * 60 * 60 * 1000,
} satisfies { durationMs: number; id: ReviewWindowId; label: string };

const reviewWindows = [
  defaultReviewWindow,
  { id: "48h", label: "Last 48 hours", durationMs: 48 * 60 * 60 * 1000 },
  { id: "week", label: "Last week", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { id: "month", label: "Last month", durationMs: 30 * 24 * 60 * 60 * 1000 },
  { id: "year", label: "Last year", durationMs: 365 * 24 * 60 * 60 * 1000 },
] satisfies Array<{ durationMs: number; id: ReviewWindowId; label: string }>;
const contextRelationships = ["family", "friend", "professional", "service", "unknown"];
const contextTones = ["polite", "warm", "direct", "terse", "avoid_rude"];
const contextReplyPostures = ["do_not_reply", "reply_if_needed", "usually_reply", "always_reply"];
const personalDetailChoices = ["location", "health_updates", "daily_agenda", "family_updates"];

function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

function HoldConfirmButton({
  children,
  className,
  confirmingLabel,
  disabled,
  onConfirm,
  title,
}: {
  children: ReactNode;
  className: string;
  confirmingLabel: string;
  disabled?: boolean;
  onConfirm: () => void;
  title: string;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHold = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setHolding(false);
  }, []);

  const beginHold = useCallback(() => {
    if (disabled || timerRef.current) {
      return;
    }

    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      onConfirm();
    }, holdConfirmMs);
  }, [disabled, onConfirm]);

  useEffect(() => clearHold, [clearHold]);

  return (
    <button
      aria-busy={holding}
      className={`${className} hold-confirm${holding ? " is-holding" : ""}`}
      disabled={disabled}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          beginHold();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") {
          clearHold();
        }
      }}
      onPointerCancel={clearHold}
      onPointerDown={beginHold}
      onPointerLeave={clearHold}
      onPointerUp={clearHold}
      title={title}
      type="button"
    >
      <span>{holding ? confirmingLabel : children}</span>
    </button>
  );
}

function EmptyState({
  action,
  icon,
  message,
  title,
}: {
  action?: ReactNode;
  icon: ReactNode;
  message: string;
  title: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{message}</p>
      {action}
    </div>
  );
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function normalizeIdentifier(value: string) {
  const trimmed = value.trim().toLowerCase();

  if (trimmed.includes("@")) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  return digits || trimmed;
}

function parseDateMs(value: string) {
  const date = new Date(value);
  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
}

function ageLabel(value: string) {
  const then = parseDateMs(value);

  if (!then) {
    return "Source time unknown";
  }

  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));

  if (minutes < 60) {
    return `${minutes || 1}m since source`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 48) {
    return `${hours}h since source`;
  }

  return `${Math.floor(hours / 24)}d since source`;
}

function displayLocalDateTime(value: string) {
  const time = parseDateMs(value);

  if (!time) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(time));
}

function isInsideReviewWindow(time: number, now: number, durationMs: number) {
  return time > 0 && now - time <= durationMs;
}

function categoryImportance(categories: string[]) {
  const normalized = categories.map((category) => category.toLowerCase());

  if (
    normalized.some((category) =>
      ["vip", "important", "family", "partner", "spouse", "parent", "child"].includes(category),
    )
  ) {
    return 110;
  }

  if (normalized.some((category) => ["caregiver", "medical", "doctor"].includes(category))) {
    return 95;
  }

  if (normalized.some((category) => ["work", "client", "boss"].includes(category))) {
    return 65;
  }

  if (normalized.some((category) => ["friend", "neighbor"].includes(category))) {
    return 45;
  }

  return 20;
}

function ContactAvatar({
  contact,
  size = "normal",
}: {
  contact: Contact;
  size?: "normal" | "large";
}) {
  return (
    <span className={`contact-avatar contact-avatar-${size}`}>
      {contact.photoUrl ? (
        <Image
          alt=""
          height={size === "large" ? 72 : 44}
          src={contact.photoUrl}
          unoptimized
          width={size === "large" ? 72 : 44}
        />
      ) : (
        initialsFor(contact.displayName)
      )}
    </span>
  );
}

function blankContact(): Contact {
  const id = `local:${crypto.randomUUID()}`;

  return {
    birthday: "",
    categories: ["manual"],
    conversationCount: 0,
    displayName: "New contact",
    emailPoints: [],
    familyName: "",
    givenName: "New",
    id,
    notes: "",
    organizationName: "",
    organizationTitle: "",
    phonePoints: [],
    photoUrl: null,
    updatedAt: "Just now",
  };
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function contactToCsvRow(contact: Contact) {
  return [
    contact.id,
    contact.displayName,
    contact.givenName,
    contact.familyName,
    contact.organizationName,
    contact.organizationTitle,
    contact.phonePoints.map((point) => point.value).join("; "),
    contact.emailPoints.map((point) => point.value).join("; "),
    contact.categories.join("; "),
    contact.conversationCount,
    contact.updatedAt,
    contact.notes,
  ]
    .map(csvCell)
    .join(",");
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadDraftProposals() {
  const response = await fetch("/api/imessage/drafts", { cache: "no-store" });
  const payload = (await response.json()) as {
    drafts?: DraftProposal[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load draft proposals");
  }

  return payload.drafts ?? [];
}

async function loadScheduledSends() {
  const response = await fetch("/api/imessage/schedules", { cache: "no-store" });
  const payload = (await response.json()) as {
    error?: string;
    schedules?: ScheduledSendView[];
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load scheduled sends");
  }

  return payload.schedules ?? [];
}

async function loadContextData() {
  const response = await fetch("/api/context", { cache: "no-store" });
  const payload = (await response.json()) as ContextDataView & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load context");
  }

  return payload;
}

function toLocalDateTimeInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function defaultScheduleInputValue() {
  const date = new Date();

  date.setHours(date.getHours() + 1, 0, 0, 0);

  return toLocalDateTimeInputValue(date);
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The request timed out. The dev server may need a restart.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizedContact(value: unknown): Contact | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Partial<Contact>;
  const displayName =
    typeof input.displayName === "string" && input.displayName.trim()
      ? input.displayName.trim()
      : "Imported contact";

  return {
    birthday: typeof input.birthday === "string" ? input.birthday : "",
    categories: Array.isArray(input.categories)
      ? input.categories.filter((item): item is string => typeof item === "string" && !!item)
      : ["imported"],
    conversationCount: typeof input.conversationCount === "number" ? input.conversationCount : 0,
    displayName,
    emailPoints: Array.isArray(input.emailPoints) ? input.emailPoints : [],
    familyName: typeof input.familyName === "string" ? input.familyName : "",
    givenName: typeof input.givenName === "string" ? input.givenName : displayName,
    id: typeof input.id === "string" ? input.id : `imported:${crypto.randomUUID()}`,
    notes: typeof input.notes === "string" ? input.notes : "",
    organizationName: typeof input.organizationName === "string" ? input.organizationName : "",
    organizationTitle: typeof input.organizationTitle === "string" ? input.organizationTitle : "",
    phonePoints: Array.isArray(input.phonePoints) ? input.phonePoints : [],
    photoUrl: typeof input.photoUrl === "string" ? input.photoUrl : null,
    updatedAt: "Imported just now",
  };
}

function parseVcardContacts(text: string) {
  return text
    .split(/BEGIN:VCARD/i)
    .map((card) => card.trim())
    .filter(Boolean)
    .map((card) => {
      const lines = card
        .replace(/END:VCARD/gi, "")
        .split(/\r?\n/)
        .map((line) => line.trim());
      const read = (prefix: string) =>
        lines
          .find((line) => line.toUpperCase().startsWith(prefix))
          ?.split(":")
          .slice(1)
          .join(":") ?? "";
      const fullName = read("FN") || "Imported contact";
      const nameParts = read("N").split(";");
      const categories = read("CATEGORIES")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const photo = read("PHOTO");

      return {
        birthday: read("BDAY"),
        categories: categories.length > 0 ? categories : ["imported"],
        conversationCount: 0,
        displayName: fullName,
        emailPoints: lines
          .filter((line) => line.toUpperCase().startsWith("EMAIL"))
          .map((line) => ({
            kind: "email",
            label: "imported",
            value: line.split(":").slice(1).join(":"),
          })),
        familyName: nameParts[0] ?? "",
        givenName: nameParts[1] || fullName,
        id: `vcf:${crypto.randomUUID()}`,
        notes: read("NOTE"),
        organizationName: read("ORG"),
        organizationTitle: read("TITLE"),
        phonePoints: lines
          .filter((line) => line.toUpperCase().startsWith("TEL"))
          .map((line) => ({
            kind: "phone",
            label: "imported",
            value: line.split(":").slice(1).join(":"),
          })),
        photoUrl: photo
          ? photo.startsWith("http")
            ? photo
            : `data:image/jpeg;base64,${photo}`
          : null,
        updatedAt: "Imported just now",
      } satisfies Contact;
    });
}

export function AppShell({ currentUser }: { currentUser: PublicUser }) {
  const [activeView, setActiveView] = useState<View>("overview");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftProposal[]>([]);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("essentials");
  const [schedules, setSchedules] = useState<ScheduledSendView[]>([]);
  const [contextData, setContextData] = useState<ContextDataView | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  const refreshApprovals = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setDraftsLoading(true);
    }

    setDraftError(null);

    try {
      const [nextDrafts, nextSchedules] = await Promise.all([
        loadDraftProposals(),
        loadScheduledSends(),
      ]);

      setDrafts(nextDrafts);
      setSchedules(nextSchedules);
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Could not load drafts");
      setDrafts([]);
      setSchedules([]);
    } finally {
      if (!quiet) {
        setDraftsLoading(false);
      }
    }
  }, []);

  const refreshContext = useCallback(async () => {
    setContextLoading(true);
    setContextError(null);

    try {
      setContextData(await loadContextData());
    } catch (error) {
      setContextError(error instanceof Error ? error.message : "Could not load context");
      setContextData(null);
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedMode = window.localStorage.getItem("commshub99:mode");

    if (savedMode === "essentials" || savedMode === "power") {
      setMode(savedMode);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadLocalData() {
      setConversationsLoading(true);
      setConversationError(null);
      setContactsLoading(true);
      setContactError(null);
      setDraftsLoading(true);
      setDraftError(null);
      setContextLoading(true);
      setContextError(null);

      try {
        const [
          conversationResponse,
          contactResponse,
          draftResponse,
          scheduleResponse,
          contextResponse,
        ] = await Promise.all([
          fetch("/api/imessage/conversations", { cache: "no-store" }),
          fetch("/api/imessage/contacts", { cache: "no-store" }),
          loadDraftProposals(),
          loadScheduledSends(),
          loadContextData(),
        ]);
        const conversationPayload = (await conversationResponse.json()) as {
          conversations?: Conversation[];
          error?: string;
        };
        const contactPayload = (await contactResponse.json()) as {
          contacts?: Contact[];
          error?: string;
        };

        if (!ignore) {
          setDrafts(draftResponse);
          setSchedules(scheduleResponse);
          setContextData(contextResponse);
        }

        if (!ignore) {
          if (conversationResponse.ok) {
            setConversations(conversationPayload.conversations ?? []);
          } else {
            setConversationError(conversationPayload.error ?? "Could not load conversations");
            setConversations([]);
          }
        }

        if (!ignore) {
          if (contactResponse.ok) {
            setContacts(contactPayload.contacts ?? []);
          } else {
            setContactError(contactPayload.error ?? "Could not load contacts");
            setContacts([]);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load local data";

        if (!ignore) {
          setConversationError(message);
          setConversations([]);
          setContactError(message);
          setContacts([]);
          setDraftError(message);
          setDrafts([]);
          setContextError(message);
          setContextData(null);
        }
      } finally {
        if (!ignore) {
          setConversationsLoading(false);
          setContactsLoading(false);
          setDraftsLoading(false);
          setContextLoading(false);
        }
      }
    }

    void loadLocalData();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const events = new EventSource("/api/events");

    events.addEventListener("approvals", () => {
      void refreshApprovals({ quiet: true });
    });

    return () => {
      events.close();
    };
  }, [refreshApprovals]);

  function selectMode(nextMode: Mode) {
    setMode(nextMode);
    window.localStorage.setItem("commshub99:mode", nextMode);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  const pageTitle = useMemo(() => {
    if (activeView === "conversations") {
      return "Conversations";
    }

    if (activeView === "approvals") {
      return "Approvals";
    }

    if (activeView === "contacts") {
      return "Contacts";
    }

    if (activeView === "context") {
      return "Context";
    }

    if (activeView === "people") {
      return "People";
    }

    if (activeView === "settings") {
      return "Settings";
    }

    return "Operations";
  }, [activeView]);

  const pageSubtitle =
    mode === "essentials" ? "Foundations and read-only browse" : "Full operator workspace";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand brand-button"
          type="button"
          onClick={() => setActiveView("overview")}
        >
          <span className="brand-mark">
            <Radio aria-hidden size={18} />
          </span>
          <span>commshub99</span>
        </button>

        <nav className="nav" aria-label="Primary">
          {navItems.map((item) => (
            <button
              aria-current={activeView === item.view ? "page" : undefined}
              className="nav-item"
              key={item.view}
              onClick={() => setActiveView(item.view)}
              title={item.label}
              type="button"
            >
              {item.icon}
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>Local-first</span>
          <span>AGPL-3.0-or-later</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="page-title">
            <h1>{pageTitle}</h1>
            <span>
              {pageSubtitle} · {currentUser.name}
            </span>
          </div>
          <div className="topbar-actions">
            <fieldset className="mode-toggle">
              <legend className="sr-only">Interface mode</legend>
              <button
                aria-pressed={mode === "essentials"}
                onClick={() => selectMode("essentials")}
                type="button"
              >
                Essentials
              </button>
              <button
                aria-pressed={mode === "power"}
                onClick={() => selectMode("power")}
                type="button"
              >
                Power
              </button>
            </fieldset>
            <button
              className="ghost-button icon-button"
              onClick={signOut}
              title="Sign out"
              type="button"
            >
              <LogOut aria-label="Sign out" size={16} />
            </button>
          </div>
        </header>

        {activeView === "overview" ? (
          <Overview
            conversationsCount={conversations.length}
            conversationsLoading={conversationsLoading}
            draftsCount={drafts.length}
            draftsLoading={draftsLoading}
            mode={mode}
            onSelectView={setActiveView}
          />
        ) : null}
        {activeView === "conversations" ? (
          <Conversations
            conversations={conversations}
            error={conversationError}
            loading={conversationsLoading}
          />
        ) : null}
        {activeView === "contacts" ? (
          <Contacts
            canWriteContacts={currentUser.role === "admin"}
            contacts={contacts}
            error={contactError}
            loading={contactsLoading}
          />
        ) : null}
        {activeView === "approvals" ? (
          <Approvals
            canMutateDrafts={currentUser.role === "admin"}
            contacts={contacts}
            conversations={conversations}
            drafts={drafts}
            error={draftError}
            loading={draftsLoading}
            onRefresh={refreshApprovals}
            schedules={schedules}
          />
        ) : null}
        {activeView === "context" ? (
          <ContextView
            canEditContext={currentUser.role === "admin"}
            data={contextData}
            error={contextError}
            loading={contextLoading}
            onRefresh={refreshContext}
          />
        ) : null}
        {activeView === "people" ? <People /> : null}
        {activeView === "settings" ? <SettingsView mode={mode} onSelectMode={selectMode} /> : null}
      </main>
    </div>
  );
}

function Overview({
  conversationsCount,
  conversationsLoading,
  draftsCount,
  draftsLoading,
  mode,
  onSelectView,
}: {
  conversationsCount: number;
  conversationsLoading: boolean;
  draftsCount: number;
  draftsLoading: boolean;
  mode: Mode;
  onSelectView: (view: View) => void;
}) {
  return (
    <div className="dashboard">
      <section className="section" aria-labelledby="readiness-heading">
        <div className="metric-grid">
          <button
            className="metric metric-button"
            onClick={() => onSelectView("approvals")}
            type="button"
          >
            <span>Pending approvals</span>
            <strong>{draftsLoading ? "..." : draftsCount}</strong>
          </button>
          <button
            className="metric metric-button"
            onClick={() => onSelectView("conversations")}
            type="button"
          >
            <span>Conversations</span>
            <strong>{conversationsLoading ? "..." : conversationsCount}</strong>
          </button>
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
          <StatusBadge tone="waiting">{mode === "essentials" ? "Essentials" : "Power"}</StatusBadge>
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
  );
}

function Conversations({
  conversations,
  error,
  loading,
}: {
  conversations: Conversation[];
  error: string | null;
  loading: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (conversations.length === 0) {
      setSelectedId(undefined);
      return;
    }

    if (!selectedId || !conversations.some((conversation) => conversation.id === selectedId)) {
      setSelectedId(conversations[0]?.id);
    }
  }, [conversations, selectedId]);

  const filteredConversations = conversations.filter((conversation) => {
    const searchableText = [
      conversation.channel,
      conversation.contact,
      conversation.handle,
      conversation.lastMessage,
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(query.trim().toLowerCase());
  });
  const selectedConversation =
    filteredConversations.find((conversation) => conversation.id === selectedId) ??
    filteredConversations[0];

  return (
    <section className="content-band" aria-labelledby="conversations-heading">
      <div className="section-heading">
        <h2 id="conversations-heading">Browse Conversations</h2>
        <StatusBadge tone={error ? "waiting" : "ready"}>
          {loading ? "Loading" : `${conversations.length} conversations`}
        </StatusBadge>
      </div>

      <div className="conversation-tools">
        <label className="search-field">
          <Search aria-hidden size={18} />
          <span className="sr-only">Search conversations</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, handle, or message"
            type="search"
            value={query}
          />
        </label>
        <button
          className="action-button"
          disabled
          title="Draft creation is not wired yet"
          type="button"
        >
          New draft
        </button>
      </div>

      {error ? (
        <EmptyState
          icon={<MessageCircle aria-hidden size={24} />}
          message={error}
          title="Could not load iMessage data"
        />
      ) : null}

      {!error && loading ? (
        <EmptyState
          icon={<MessageCircle aria-hidden size={24} />}
          message="Reading the local iMessage archive from ~/imsg-data."
          title="Loading conversations"
        />
      ) : null}

      {!error && !loading ? (
        <div className="conversation-layout">
          <ul className="conversation-list" aria-label="Conversations">
            {filteredConversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  aria-pressed={selectedConversation?.id === conversation.id}
                  className="conversation-row"
                  onClick={() => setSelectedId(conversation.id)}
                  type="button"
                >
                  <span className="conversation-row-top">
                    <strong>{conversation.contact}</strong>
                    <span>{conversation.lastMessageAt}</span>
                  </span>
                  <span className="conversation-meta">
                    {conversation.channel} · {conversation.handle}
                  </span>
                  <span className="conversation-preview">{conversation.lastMessage}</span>
                  <span className="conversation-row-bottom">
                    <StatusBadge tone={conversation.status === "matched" ? "ready" : "waiting"}>
                      {conversation.status === "matched" ? "Matched" : "Needs contact"}
                    </StatusBadge>
                    {conversation.unreadCount > 0 ? (
                      <span className="unread-pill">{conversation.unreadCount}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}

            {filteredConversations.length === 0 ? (
              <div className="conversation-empty">No conversations match this search.</div>
            ) : null}
          </ul>

          <div className="conversation-detail">
            {selectedConversation ? (
              <>
                <div className="conversation-detail-header">
                  <span>
                    <strong>{selectedConversation.contact}</strong>
                    <span>
                      {selectedConversation.channel} · {selectedConversation.handle} ·{" "}
                      {selectedConversation.messageCount} messages
                    </span>
                  </span>
                  <div className="detail-actions">
                    {selectedConversation.linkedContact ? (
                      <span className="linked-contact-pill">
                        Linked to {selectedConversation.linkedContact.name}
                      </span>
                    ) : (
                      <button
                        className="ghost-button"
                        disabled
                        title="No automatic contacts-mcp match exists for this handle yet"
                        type="button"
                      >
                        Link contact
                      </button>
                    )}
                    <button
                      className="ghost-button"
                      disabled
                      title="Archive actions require the channel adapter"
                      type="button"
                    >
                      Archive
                    </button>
                  </div>
                </div>
                <div
                  className="message-thread"
                  aria-label={`Messages with ${selectedConversation.contact}`}
                  role="log"
                >
                  {selectedConversation.messages.map((message) => (
                    <div className={`message-bubble message-${message.direction}`} key={message.id}>
                      <p>{message.body}</p>
                      <span>{message.sentAt}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                icon={<MessageCircle aria-hidden size={24} />}
                message="Once the iMessage read model lands, conversations from the adapter will appear here."
                title="No conversation selected"
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Contacts({
  canWriteContacts,
  contacts,
  error,
  loading,
}: {
  canWriteContacts: boolean;
  contacts: Contact[];
  error: string | null;
  loading: boolean;
}) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [managedContacts, setManagedContacts] = useState<Contact[]>(contacts);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("all");
  const [draftContact, setDraftContact] = useState<Contact | null>(null);
  const [newTag, setNewTag] = useState("");
  const [trackedIds, setTrackedIds] = useState<string[]>([]);

  useEffect(() => {
    setManagedContacts(contacts);
  }, [contacts]);

  useEffect(() => {
    const savedTrackedIds = window.localStorage.getItem("commshub99:tracked-contacts");

    if (savedTrackedIds) {
      try {
        const parsed = JSON.parse(savedTrackedIds) as unknown;

        if (Array.isArray(parsed)) {
          setTrackedIds(parsed.filter((item): item is string => typeof item === "string"));
        }
      } catch {
        setTrackedIds([]);
      }
    }
  }, []);

  useEffect(() => {
    if (managedContacts.length === 0) {
      setSelectedId(undefined);
      return;
    }

    if (!selectedId || !managedContacts.some((contact) => contact.id === selectedId)) {
      setSelectedId(managedContacts[0]?.id);
    }
  }, [managedContacts, selectedId]);

  const allTags = useMemo(
    () =>
      Array.from(new Set(managedContacts.flatMap((contact) => contact.categories)))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [managedContacts],
  );

  const trackedCount = trackedIds.filter((id) =>
    managedContacts.some((contact) => contact.id === id),
  ).length;

  const filteredContacts = managedContacts.filter((contact) => {
    const searchableText = [
      contact.displayName,
      contact.organizationName,
      contact.organizationTitle,
      contact.notes,
      ...contact.categories,
      ...contact.phonePoints.map((point) => point.value),
      ...contact.emailPoints.map((point) => point.value),
    ]
      .join(" ")
      .toLowerCase();

    return (
      searchableText.includes(query.trim().toLowerCase()) &&
      (activeTag === "all" || activeTag === "tracked" || contact.categories.includes(activeTag)) &&
      (activeTag !== "tracked" || trackedIds.includes(contact.id))
    );
  });
  const selectedContact =
    filteredContacts.find((contact) => contact.id === selectedId) ?? filteredContacts[0];
  const editing = draftContact !== null;
  const activeContact = draftContact ?? selectedContact;
  const selectedPoints = activeContact
    ? [...activeContact.phonePoints, ...activeContact.emailPoints]
    : [];
  const visibleContacts = selectedContact ? [selectedContact] : filteredContacts;

  function saveTrackedIds(nextTrackedIds: string[]) {
    setTrackedIds(nextTrackedIds);
    window.localStorage.setItem("commshub99:tracked-contacts", JSON.stringify(nextTrackedIds));
  }

  function updateSelectedContact(nextContact: Contact) {
    setManagedContacts((current) =>
      current.map((contact) => (contact.id === nextContact.id ? nextContact : contact)),
    );
    setDraftContact(nextContact);
  }

  function beginAddContact() {
    if (!canWriteContacts) {
      return;
    }

    const nextContact = blankContact();
    setManagedContacts((current) => [nextContact, ...current]);
    setSelectedId(nextContact.id);
    setDraftContact(nextContact);
  }

  function beginEdit() {
    if (selectedContact && canWriteContacts) {
      setDraftContact(selectedContact);
    }
  }

  function cancelEdit() {
    setDraftContact(null);
  }

  async function saveContact(contact: Contact) {
    const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}`, {
      body: JSON.stringify(contact),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    });
    const payload = (await response.json()) as {
      contact?: {
        id: string;
      };
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not save contact");
    }

    return {
      ...contact,
      id: payload.contact?.id ?? contact.id,
      updatedAt: "Saved just now",
    };
  }

  async function saveEdit() {
    if (!draftContact) {
      return;
    }

    const originalId = draftContact.id;
    const savedContact = await saveContact({
      ...draftContact,
      displayName:
        draftContact.displayName.trim() ||
        [draftContact.givenName, draftContact.familyName].filter(Boolean).join(" ") ||
        "Unnamed contact",
    });

    setManagedContacts((current) =>
      current.map((contact) => (contact.id === originalId ? savedContact : contact)),
    );
    setSelectedId(savedContact.id);
    setDraftContact(null);
  }

  function removeSelectedContact() {
    if (!selectedContact) {
      return;
    }

    setManagedContacts((current) => current.filter((contact) => contact.id !== selectedContact.id));
    saveTrackedIds(trackedIds.filter((id) => id !== selectedContact.id));
  }

  function toggleTracking(contactId: string) {
    const nextTrackedIds = trackedIds.includes(contactId)
      ? trackedIds.filter((id) => id !== contactId)
      : [...trackedIds, contactId];

    saveTrackedIds(nextTrackedIds);
  }

  function exportJson() {
    downloadText(
      "commshub99-contacts.json",
      JSON.stringify({ contacts: visibleContacts }, null, 2),
      "application/json",
    );
  }

  function exportCsv() {
    const header = [
      "id",
      "displayName",
      "givenName",
      "familyName",
      "organizationName",
      "organizationTitle",
      "phones",
      "emails",
      "tags",
      "conversationCount",
      "updatedAt",
      "notes",
    ].join(",");

    downloadText(
      "commshub99-contacts.csv",
      [header, ...visibleContacts.map(contactToCsvRow)].join("\n"),
      "text/csv",
    );
  }

  async function importContacts(file: File | undefined) {
    if (!file) {
      return;
    }

    const text = await file.text();
    const imported =
      file.name.toLowerCase().endsWith(".vcf") || text.includes("BEGIN:VCARD")
        ? parseVcardContacts(text)
        : (() => {
            const parsed = JSON.parse(text) as unknown;
            const values =
              parsed && typeof parsed === "object" && "contacts" in parsed
                ? (parsed as { contacts: unknown }).contacts
                : parsed;

            return Array.isArray(values)
              ? values.map(normalizedContact).filter((contact): contact is Contact => !!contact)
              : [];
          })();

    setManagedContacts((current) => [...imported, ...current]);
    setSelectedId(imported[0]?.id ?? selectedId);
  }

  async function importPhoto(file: File | undefined) {
    if (!file || !selectedContact) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const photoUrl = typeof reader.result === "string" ? reader.result : null;

      if (photoUrl) {
        const nextContact = {
          ...(draftContact ?? selectedContact),
          photoUrl,
          updatedAt: "Photo added just now",
        };
        updateSelectedContact(nextContact);
        void saveContact(nextContact).then((savedContact) => {
          setManagedContacts((current) =>
            current.map((contact) => (contact.id === nextContact.id ? savedContact : contact)),
          );
          setSelectedId(savedContact.id);
        });
      }
    });
    reader.readAsDataURL(file);
  }

  function updateDraft<K extends keyof Contact>(key: K, value: Contact[K]) {
    if (!draftContact) {
      return;
    }

    setDraftContact({ ...draftContact, [key]: value });
  }

  function addContactPoint(kind: "email" | "phone") {
    if (!draftContact) {
      return;
    }

    const key = kind === "email" ? "emailPoints" : "phonePoints";
    updateDraft(key, [...draftContact[key], { kind, label: "main", value: "" }]);
  }

  function updateContactPoint(kind: "email" | "phone", index: number, value: string) {
    if (!draftContact) {
      return;
    }

    const key = kind === "email" ? "emailPoints" : "phonePoints";
    updateDraft(
      key,
      draftContact[key].map((point, pointIndex) =>
        pointIndex === index ? { ...point, value } : point,
      ),
    );
  }

  function removeContactPoint(kind: "email" | "phone", index: number) {
    if (!draftContact) {
      return;
    }

    const key = kind === "email" ? "emailPoints" : "phonePoints";
    updateDraft(
      key,
      draftContact[key].filter((_, pointIndex) => pointIndex !== index),
    );
  }

  function addTag() {
    const tag = newTag.trim();

    if (!draftContact || !tag || draftContact.categories.includes(tag)) {
      return;
    }

    updateDraft("categories", [...draftContact.categories, tag]);
    setNewTag("");
  }

  function removeTag(tag: string) {
    if (!draftContact) {
      return;
    }

    updateDraft(
      "categories",
      draftContact.categories.filter((category) => category !== tag),
    );
  }

  const tracked = selectedContact ? trackedIds.includes(selectedContact.id) : false;

  return (
    <section className="content-band" aria-labelledby="contacts-heading">
      <div className="section-heading">
        <h2 id="contacts-heading">Contact Studio</h2>
        <StatusBadge tone={error ? "waiting" : "ready"}>
          {loading ? "Loading" : `${managedContacts.length} contacts · ${trackedCount} tracked`}
        </StatusBadge>
      </div>

      <div className="contact-command-bar">
        <label className="search-field">
          <Search aria-hidden size={18} />
          <span className="sr-only">Search contacts</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, email, or organization"
            type="search"
            value={query}
          />
        </label>
        <fieldset className="tag-filter">
          <legend className="sr-only">Filter contacts by tag</legend>
          <button
            aria-pressed={activeTag === "all"}
            onClick={() => setActiveTag("all")}
            type="button"
          >
            All
          </button>
          <button
            aria-pressed={activeTag === "tracked"}
            onClick={() => setActiveTag("tracked")}
            type="button"
          >
            Tracked
          </button>
          {allTags.slice(0, 6).map((tag) => (
            <button
              aria-pressed={activeTag === tag}
              key={tag}
              onClick={() => setActiveTag(tag)}
              type="button"
            >
              {tag}
            </button>
          ))}
        </fieldset>
        <button
          className="action-button"
          disabled={!canWriteContacts}
          onClick={beginAddContact}
          title={canWriteContacts ? "Add contact" : "Only admins can add contacts"}
          type="button"
        >
          <Plus aria-hidden size={17} />
          Add
        </button>
        <button
          className="ghost-button"
          disabled={!canWriteContacts}
          onClick={() => importInputRef.current?.click()}
          title={canWriteContacts ? "Import contacts" : "Only admins can import contacts"}
          type="button"
        >
          <FileUp aria-hidden size={17} />
          Import
        </button>
        <button className="ghost-button" onClick={exportJson} type="button">
          <FileDown aria-hidden size={17} />
          JSON
        </button>
        <button className="ghost-button" onClick={exportCsv} type="button">
          <Download aria-hidden size={17} />
          CSV
        </button>
        <input
          accept=".json,.vcf,application/json,text/vcard,text/x-vcard"
          className="sr-only"
          onChange={(event) => void importContacts(event.target.files?.[0])}
          ref={importInputRef}
          type="file"
        />
      </div>

      {error ? (
        <EmptyState
          icon={<UsersRound aria-hidden size={24} />}
          message={error}
          title="Could not load contacts"
        />
      ) : null}

      {!error && loading ? (
        <EmptyState
          icon={<UsersRound aria-hidden size={24} />}
          message="Reading contacts enriched by contacts-mcp from the local SQLite database."
          title="Loading contacts"
        />
      ) : null}

      {!error && !loading ? (
        <div className="contacts-layout">
          <ul className="contact-list" aria-label="Contacts">
            {filteredContacts.map((contact) => (
              <li key={contact.id}>
                <button
                  aria-pressed={selectedContact?.id === contact.id}
                  className="contact-row"
                  onClick={() => setSelectedId(contact.id)}
                  type="button"
                >
                  <ContactAvatar contact={contact} />
                  <span>
                    <strong>{contact.displayName}</strong>
                    <span>
                      {contact.organizationName ||
                        contact.phonePoints[0]?.value ||
                        contact.emailPoints[0]?.value}
                    </span>
                  </span>
                  <span className="contact-row-stack">
                    {trackedIds.includes(contact.id) ? (
                      <Bell aria-label="Tracked contact" size={15} />
                    ) : null}
                    <StatusBadge tone={contact.conversationCount > 0 ? "ready" : "waiting"}>
                      {contact.conversationCount} chats
                    </StatusBadge>
                  </span>
                </button>
              </li>
            ))}

            {filteredContacts.length === 0 ? (
              <div className="conversation-empty">No contacts match this search.</div>
            ) : null}
          </ul>

          <div className="contact-detail">
            {activeContact ? (
              <>
                <div className="contact-hero">
                  <button
                    className="contact-photo-button"
                    disabled={!canWriteContacts}
                    onClick={() => photoInputRef.current?.click()}
                    title={
                      canWriteContacts
                        ? "Upload a local contact picture"
                        : "Only admins can edit contacts"
                    }
                    type="button"
                  >
                    <ContactAvatar contact={activeContact} size="large" />
                    <span>
                      <ImagePlus aria-hidden size={16} />
                    </span>
                  </button>
                  <input
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => void importPhoto(event.target.files?.[0])}
                    ref={photoInputRef}
                    type="file"
                  />
                  <span>
                    <strong>{activeContact.displayName}</strong>
                    <span>
                      {[activeContact.organizationTitle, activeContact.organizationName]
                        .filter(Boolean)
                        .join(", ") || "contacts-mcp contact"}
                    </span>
                  </span>
                  <div className="detail-actions">
                    {editing ? (
                      <>
                        <button
                          className="action-button"
                          onClick={() => void saveEdit()}
                          type="button"
                        >
                          Save
                        </button>
                        <button className="ghost-button" onClick={cancelEdit} type="button">
                          <X aria-hidden size={17} />
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="ghost-button"
                          disabled={!canWriteContacts}
                          onClick={beginEdit}
                          title={
                            canWriteContacts ? "Edit contact" : "Only admins can edit contacts"
                          }
                          type="button"
                        >
                          <Pencil aria-hidden size={17} />
                          Edit
                        </button>
                        <button
                          className="ghost-button"
                          onClick={() => selectedContact && toggleTracking(selectedContact.id)}
                          type="button"
                        >
                          <Eye aria-hidden size={17} />
                          {tracked ? "Untrack" : "Track"}
                        </button>
                        <button
                          className="ghost-button"
                          onClick={removeSelectedContact}
                          type="button"
                        >
                          <Trash2 aria-hidden size={17} />
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="contact-facts">
                  <div>
                    <span>Linked conversations</span>
                    <strong>{activeContact.conversationCount}</strong>
                  </div>
                  <div>
                    <span>Updated</span>
                    <strong>{activeContact.updatedAt}</strong>
                  </div>
                  <div>
                    <span>Contact points</span>
                    <strong>{selectedPoints.length}</strong>
                  </div>
                </div>

                {editing && draftContact ? (
                  <section className="contact-editor" aria-labelledby="contact-edit-heading">
                    <h3 id="contact-edit-heading">Profile</h3>
                    <label>
                      Display name
                      <input
                        onChange={(event) => updateDraft("displayName", event.target.value)}
                        value={draftContact.displayName}
                      />
                    </label>
                    <label>
                      Given name
                      <input
                        onChange={(event) => updateDraft("givenName", event.target.value)}
                        value={draftContact.givenName}
                      />
                    </label>
                    <label>
                      Family name
                      <input
                        onChange={(event) => updateDraft("familyName", event.target.value)}
                        value={draftContact.familyName}
                      />
                    </label>
                    <label>
                      Organization
                      <input
                        onChange={(event) => updateDraft("organizationName", event.target.value)}
                        value={draftContact.organizationName}
                      />
                    </label>
                    <label>
                      Title
                      <input
                        onChange={(event) => updateDraft("organizationTitle", event.target.value)}
                        value={draftContact.organizationTitle}
                      />
                    </label>
                    <label>
                      Birthday
                      <input
                        onChange={(event) => updateDraft("birthday", event.target.value)}
                        type="date"
                        value={draftContact.birthday}
                      />
                    </label>
                    <label className="editor-wide">
                      Notes
                      <textarea
                        onChange={(event) => updateDraft("notes", event.target.value)}
                        value={draftContact.notes}
                      />
                    </label>
                  </section>
                ) : null}

                <section className="contact-section" aria-labelledby="contact-tags-heading">
                  <h3 id="contact-tags-heading">Tags</h3>
                  <div className="tag-cloud">
                    {activeContact.categories.map((tag) => (
                      <span className="contact-tag" key={tag}>
                        <Tag aria-hidden size={14} />
                        {tag}
                        {editing ? (
                          <button onClick={() => removeTag(tag)} type="button">
                            <X aria-label={`Remove ${tag}`} size={13} />
                          </button>
                        ) : null}
                      </span>
                    ))}
                    {editing ? (
                      <label className="tag-add">
                        <span className="sr-only">Add tag</span>
                        <input
                          onChange={(event) => setNewTag(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addTag();
                            }
                          }}
                          placeholder="Add tag"
                          value={newTag}
                        />
                        <button onClick={addTag} type="button">
                          <Plus aria-label="Add tag" size={14} />
                        </button>
                      </label>
                    ) : null}
                  </div>
                </section>

                <section className="contact-section" aria-labelledby="contact-points-heading">
                  <div className="contact-section-title">
                    <h3 id="contact-points-heading">Handles</h3>
                    {editing ? (
                      <span>
                        <button
                          className="mini-button"
                          onClick={() => addContactPoint("phone")}
                          type="button"
                        >
                          <Phone aria-hidden size={14} />
                          Phone
                        </button>
                        <button
                          className="mini-button"
                          onClick={() => addContactPoint("email")}
                          type="button"
                        >
                          <Mail aria-hidden size={14} />
                          Email
                        </button>
                      </span>
                    ) : null}
                  </div>
                  <ul className="contact-point-list">
                    {(editing && draftContact
                      ? draftContact.phonePoints
                      : activeContact.phonePoints
                    ).map((point, index) => (
                      <li key={`phone-${point.label}-${point.value}`}>
                        <span>
                          <Phone aria-hidden size={15} />
                          {point.label || point.kind}
                        </span>
                        {editing ? (
                          <>
                            <input
                              onChange={(event) =>
                                updateContactPoint("phone", index, event.target.value)
                              }
                              value={point.value}
                            />
                            <button
                              onClick={() => removeContactPoint("phone", index)}
                              type="button"
                            >
                              <Trash2 aria-label="Remove phone" size={15} />
                            </button>
                          </>
                        ) : (
                          <strong>{point.value}</strong>
                        )}
                      </li>
                    ))}
                    {(editing && draftContact
                      ? draftContact.emailPoints
                      : activeContact.emailPoints
                    ).map((point, index) => (
                      <li key={`email-${point.label}-${point.value}`}>
                        <span>
                          <Mail aria-hidden size={15} />
                          {point.label || point.kind}
                        </span>
                        {editing ? (
                          <>
                            <input
                              onChange={(event) =>
                                updateContactPoint("email", index, event.target.value)
                              }
                              value={point.value}
                            />
                            <button
                              onClick={() => removeContactPoint("email", index)}
                              type="button"
                            >
                              <Trash2 aria-label="Remove email" size={15} />
                            </button>
                          </>
                        ) : (
                          <strong>{point.value}</strong>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="contact-section" aria-labelledby="contact-tracking-heading">
                  <h3 id="contact-tracking-heading">Track</h3>
                  <div className="tracking-grid">
                    <div>
                      <History aria-hidden size={18} />
                      <span>
                        Last touched
                        <strong>{activeContact.updatedAt}</strong>
                      </span>
                    </div>
                    <div>
                      <MessageCircle aria-hidden size={18} />
                      <span>
                        Conversation links
                        <strong>{activeContact.conversationCount}</strong>
                      </span>
                    </div>
                    <div>
                      <BriefcaseBusiness aria-hidden size={18} />
                      <span>
                        Organization
                        <strong>{activeContact.organizationName || "None"}</strong>
                      </span>
                    </div>
                    <div>
                      <Cake aria-hidden size={18} />
                      <span>
                        Birthday
                        <strong>{activeContact.birthday || "Unknown"}</strong>
                      </span>
                    </div>
                  </div>
                </section>

                {activeContact.notes ? (
                  <section className="contact-section" aria-labelledby="contact-notes-heading">
                    <h3 id="contact-notes-heading">Notes</h3>
                    <p>{activeContact.notes}</p>
                  </section>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={<UsersRound aria-hidden size={24} />}
                message="Contacts enriched by contacts-mcp will appear here."
                title="No contact selected"
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Approvals({
  canMutateDrafts,
  contacts,
  conversations,
  drafts,
  error,
  loading,
  onRefresh,
  schedules,
}: {
  canMutateDrafts: boolean;
  contacts: Contact[];
  conversations: Conversation[];
  drafts: DraftProposal[];
  error: string | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  schedules: ScheduledSendView[];
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [rejectingUuid, setRejectingUuid] = useState<string | null>(null);
  const [rejectFutureNote, setRejectFutureNote] = useState("");
  const [reviewWindowId, setReviewWindowId] = useState<ReviewWindowId>("day");
  const [scheduleInputs, setScheduleInputs] = useState<Record<string, string>>({});
  const [schedulingUuid, setSchedulingUuid] = useState<string | null>(null);
  const reviewWindow =
    reviewWindows.find((windowOption) => windowOption.id === reviewWindowId) ?? defaultReviewWindow;
  const contactsByIdentifier = useMemo(() => {
    const matches = new Map<string, Contact>();

    for (const contact of contacts) {
      for (const point of [...contact.phonePoints, ...contact.emailPoints]) {
        if (point.value) {
          matches.set(normalizeIdentifier(point.value), contact);
        }
      }
    }

    return matches;
  }, [contacts]);
  const contactsById = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts],
  );
  const conversationsByChatId = useMemo(() => {
    const names = new Map<string, Conversation>();

    for (const conversation of conversations) {
      const chatId = conversation.id.split(":").at(-1);

      if (chatId) {
        names.set(chatId, conversation);
      }
    }

    return names;
  }, [conversations]);
  const schedulesByDraftId = useMemo(() => {
    const grouped = new Map<string, ScheduledSendView[]>();

    for (const schedule of schedules) {
      const list = grouped.get(schedule.draftId) ?? [];

      list.push(schedule);
      grouped.set(schedule.draftId, list);
    }

    for (const list of grouped.values()) {
      list.sort((left, right) => parseDateMs(left.sendAt) - parseDateMs(right.sendAt));
    }

    return grouped;
  }, [schedules]);

  async function runDraftAction(uuid: string, action: () => Promise<Response>) {
    setActionError(null);
    setBusyUuid(uuid);

    try {
      const response = await action();
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Draft action failed");
      }

      setEditingUuid(null);
      setEditText("");
      await onRefresh();
    } catch (draftError) {
      setActionError(draftError instanceof Error ? draftError.message : "Draft action failed");
    } finally {
      setBusyUuid(null);
    }
  }

  function beginEdit(draft: DraftProposal) {
    setActionError(null);
    setEditingUuid(draft.uuid);
    setEditText(draft.text);
  }

  async function approveDraft(uuid: string, overrideContextSafeguards = false) {
    await runDraftAction(uuid, () =>
      fetchWithTimeout(`/api/imessage/drafts/${encodeURIComponent(uuid)}/approve`, {
        body: JSON.stringify({ overrideContextSafeguards }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
  }

  async function saveDraft(uuid: string) {
    await runDraftAction(uuid, () =>
      fetchWithTimeout(`/api/imessage/drafts/${encodeURIComponent(uuid)}`, {
        body: JSON.stringify({ text: editText }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
    );
  }

  async function rejectDraft(uuid: string) {
    await runDraftAction(uuid, () =>
      fetchWithTimeout(`/api/imessage/drafts/${encodeURIComponent(uuid)}`, {
        body: JSON.stringify({ futureNote: rejectFutureNote }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      }),
    );
    setRejectingUuid(null);
    setRejectFutureNote("");
  }

  function scheduleInputFor(uuid: string) {
    return scheduleInputs[uuid] ?? defaultScheduleInputValue();
  }

  async function cancelSchedule(id: string, uuid: string) {
    await runDraftAction(uuid, () =>
      fetchWithTimeout(`/api/imessage/schedules/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    );
  }

  async function scheduleDraft(uuid: string, existingScheduleId?: string) {
    const value = scheduleInputFor(uuid);
    const sendAt = new Date(value);

    if (Number.isNaN(sendAt.getTime())) {
      setActionError("Choose a valid schedule time.");
      return;
    }

    setSchedulingUuid(uuid);

    try {
      if (existingScheduleId) {
        const cancelResponse = await fetchWithTimeout(
          `/api/imessage/schedules/${encodeURIComponent(existingScheduleId)}`,
          { method: "DELETE" },
        );
        const cancelPayload = (await cancelResponse.json()) as { error?: string };

        if (!cancelResponse.ok) {
          throw new Error(cancelPayload.error ?? "Could not cancel existing schedule");
        }
      }

      await runDraftAction(uuid, () =>
        fetchWithTimeout("/api/imessage/schedules", {
          body: JSON.stringify({ sendAt: sendAt.toISOString(), uuid }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not schedule draft");
    } finally {
      setSchedulingUuid(null);
    }
  }

  const draftRecipient = useCallback(
    (draft: DraftProposal) => {
      const identifierContact = draft.targetIdentifier
        ? contactsByIdentifier.get(normalizeIdentifier(draft.targetIdentifier))
        : null;
      const conversation = conversationsByChatId.get(draft.chatId);
      const conversationContact = conversation?.linkedContact
        ? contactsById.get(conversation.linkedContact.id)
        : null;
      const contact = identifierContact ?? conversationContact ?? null;
      const conversationName = conversation?.linkedContact?.name || conversation?.contact;
      const displayName =
        contact?.displayName ||
        conversationName ||
        draft.targetIdentifier ||
        `Chat ${draft.chatId}`;
      const detailParts = [
        draft.targetIdentifier && displayName !== draft.targetIdentifier
          ? draft.targetIdentifier
          : null,
        draft.chatId ? `Chat ${draft.chatId}` : null,
      ].filter(Boolean);

      return {
        contact,
        conversation,
        detail: detailParts.join(" · "),
        name: displayName,
      };
    },
    [contactsByIdentifier, contactsById, conversationsByChatId],
  );

  const importanceFor = useCallback(
    (draft: DraftProposal) => {
      const recipient = draftRecipient(draft);
      const contactScore = recipient.contact ? categoryImportance(recipient.contact.categories) : 0;
      const matchedScore = recipient.conversation?.status === "matched" ? 22 : 0;
      const conversationScore = recipient.contact
        ? Math.min(recipient.contact.conversationCount * 3, 36)
        : 0;

      return contactScore + matchedScore + conversationScore;
    },
    [draftRecipient],
  );

  const draftItems = useMemo(() => {
    return drafts
      .map((draft) => {
        const recipient = draftRecipient(draft);
        const importance = importanceFor(draft);
        const sourceTime = parseDateMs(draft.sourceMessageAt);
        const createdTime = parseDateMs(draft.createdAt);
        const reviewTime = sourceTime || createdTime;
        const searchable = [
          recipient.name,
          recipient.detail,
          draft.text,
          draft.reasoning,
          draft.model,
          draft.createdAt,
          draft.displayCreatedAt,
          draft.sourceMessageAt,
          draft.displaySourceMessageAt,
          draft.sourceRowid,
          draft.context?.replyPosture,
          draft.context?.tone,
          draft.context?.contextVersionIds.join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return {
          createdTime,
          draft,
          importance,
          recipient,
          reviewTime,
          searchable,
          sourceTime,
        };
      })
      .sort((left, right) => {
        const importanceDelta = right.importance - left.importance;

        if (importanceDelta !== 0) {
          return importanceDelta;
        }

        const sourceDelta =
          (left.sourceTime || left.createdTime) - (right.sourceTime || right.createdTime);

        if (sourceDelta !== 0) {
          return sourceDelta;
        }

        return right.createdTime - left.createdTime;
      });
  }, [drafts, draftRecipient, importanceFor]);

  const matchingDrafts = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();

    return draftItems.filter((item) => !query || item.searchable.includes(query));
  }, [draftItems, filterQuery]);
  const visibleDrafts = useMemo(() => {
    const now = Date.now();

    return matchingDrafts.filter((item) =>
      isInsideReviewWindow(item.reviewTime, now, reviewWindow.durationMs),
    );
  }, [matchingDrafts, reviewWindow.durationMs]);
  const hiddenByWindowCount = matchingDrafts.length - visibleDrafts.length;

  return (
    <section className="content-band" aria-labelledby="approvals-heading">
      <div className="section-heading">
        <h2 id="approvals-heading">Pending Approvals</h2>
        <div className="detail-actions">
          <StatusBadge tone={drafts.length > 0 ? "waiting" : "ready"}>
            {loading ? "Loading" : `${visibleDrafts.length} current`}
          </StatusBadge>
          <button
            className="ghost-button icon-button"
            disabled={loading}
            onClick={() => void onRefresh()}
            title="Refresh drafts"
            type="button"
          >
            <RefreshCw aria-label="Refresh drafts" size={16} />
          </button>
        </div>
      </div>
      <div className="approval-tools">
        <label className="search-field approval-search">
          <Search aria-hidden size={17} />
          <span className="sr-only">Filter approvals</span>
          <input
            onChange={(event) => setFilterQuery(event.target.value)}
            placeholder="Filter by person, message, or date"
            value={filterQuery}
          />
        </label>
        <fieldset className="review-window-picker">
          <legend>Review window</legend>
          <div>
            {reviewWindows.map((windowOption) => (
              <button
                aria-pressed={reviewWindowId === windowOption.id}
                key={windowOption.id}
                onClick={() => setReviewWindowId(windowOption.id)}
                type="button"
              >
                {windowOption.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="approval-sort-note" aria-live="polite">
          <Filter aria-hidden size={16} />
          <span>
            Showing {reviewWindow.label.toLowerCase()}
            {hiddenByWindowCount > 0 ? ` · ${hiddenByWindowCount} hidden as stale` : ""}
            {filterQuery ? ` · ${visibleDrafts.length} match` : ""}
          </span>
        </div>
      </div>
      {actionError ? <p className="draft-action-error">{actionError}</p> : null}
      {!canMutateDrafts && !error ? (
        <p className="draft-action-error">
          Your account can review drafts, but only admins can edit, approve, or reject them.
        </p>
      ) : null}
      {error ? (
        <EmptyState
          action={
            <button className="action-button" onClick={() => void onRefresh()} type="button">
              <RefreshCw aria-hidden size={17} />
              Retry
            </button>
          }
          icon={<ClipboardCheck aria-hidden size={24} />}
          message={error}
          title="Could not load proposals"
        />
      ) : null}
      {!error && loading ? (
        <EmptyState
          icon={<ClipboardCheck aria-hidden size={24} />}
          message="Reading imsg-agent draft files from the local chat folders."
          title="Loading proposals"
        />
      ) : null}
      {!error && !loading && drafts.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck aria-hidden size={24} />}
          message="imsg-agent is running, but there are no unapproved draft files to review right now."
          title="No drafts need review"
        />
      ) : null}
      {!error && !loading && drafts.length > 0 && visibleDrafts.length === 0 ? (
        <EmptyState
          action={
            <button
              className="ghost-button"
              onClick={() => {
                if (filterQuery) {
                  setFilterQuery("");
                } else {
                  setReviewWindowId(reviewWindowId === "day" ? "48h" : "year");
                }
              }}
              type="button"
            >
              {filterQuery
                ? "Clear filter"
                : reviewWindowId === "day"
                  ? "Show last 48 hours"
                  : "Show last year"}
            </button>
          }
          icon={<Filter aria-hidden size={24} />}
          message="No pending draft matches the current person, text, date, and review window."
          title="No matching approvals"
        />
      ) : null}
      {!error && !loading && visibleDrafts.length > 0 ? (
        <div className="draft-grid">
          {visibleDrafts.map(({ draft, importance, recipient }) => {
            const isRejecting = rejectingUuid === draft.uuid;
            const requiresContextOverride = draft.context?.replyPosture === "do_not_reply";
            const activeSchedules = schedulesByDraftId.get(`imessage:draft:${draft.uuid}`) ?? [];
            const nextSchedule = activeSchedules[0] ?? null;

            return (
              <article className="draft-card" key={draft.uuid}>
                {editingUuid === draft.uuid ? (
                  <div className="draft-editor">
                    <label htmlFor={`draft-${draft.uuid}`}>Draft reply</label>
                    <textarea
                      id={`draft-${draft.uuid}`}
                      onChange={(event) => setEditText(event.target.value)}
                      rows={4}
                      value={editText}
                    />
                  </div>
                ) : null}
                <div className="draft-card-top">
                  <span>
                    <strong>{recipient.name}</strong>
                    <span>
                      {recipient.detail ? `${recipient.detail} · ` : ""}
                      {draft.displayCreatedAt}
                    </span>
                  </span>
                  <StatusBadge tone={draft.approved ? "ready" : "waiting"}>
                    {draft.approved ? "Approved" : "Needs review"}
                  </StatusBadge>
                </div>
                <div className="approval-priority-row">
                  <span>
                    <Star aria-hidden size={15} />
                    Importance {importance}
                  </span>
                  <span>
                    <CalendarClock aria-hidden size={15} />
                    {ageLabel(draft.sourceMessageAt)}
                  </span>
                  {draft.displaySourceMessageAt ? (
                    <span>{draft.displaySourceMessageAt}</span>
                  ) : null}
                </div>
                {editingUuid === draft.uuid ? null : <p>{draft.text}</p>}
                <dl className="draft-meta">
                  <div>
                    <dt>Chat</dt>
                    <dd>{draft.chatId}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{draft.sourceRowid ?? "Unknown"}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{draft.model || "Unknown"}</dd>
                  </div>
                </dl>
                {draft.reasoning ? <p className="draft-reasoning">{draft.reasoning}</p> : null}
                {draft.context ? (
                  <div className="draft-context-panel">
                    <div className="schedule-panel-heading">
                      <span>
                        <Tag aria-hidden size={16} />
                        Context {draft.context.source === "live" ? "active now" : "from draft"}
                      </span>
                      <StatusBadge
                        tone={draft.context.replyPosture === "do_not_reply" ? "warn" : "ready"}
                      >
                        {draft.context.replyPosture}
                      </StatusBadge>
                    </div>
                    <dl className="draft-meta">
                      <div>
                        <dt>Tone</dt>
                        <dd>{draft.context.tone}</dd>
                      </div>
                      <div>
                        <dt>Profiles</dt>
                        <dd>
                          {[...draft.context.contactContextIds, draft.context.conversationContextId]
                            .filter(Boolean)
                            .join(", ") || "None"}
                        </dd>
                      </div>
                      <div>
                        <dt>Versions</dt>
                        <dd>{draft.context.contextVersionIds.join(", ") || "Unversioned"}</dd>
                      </div>
                    </dl>
                    {draft.context.customPrompt || draft.context.notes ? (
                      <p className="draft-reasoning">
                        {[draft.context.customPrompt, draft.context.notes]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="schedule-panel">
                  <div className="schedule-panel-heading">
                    <span>
                      <CalendarClock aria-hidden size={16} />
                      {nextSchedule
                        ? `Scheduled for ${displayLocalDateTime(nextSchedule.sendAt)}`
                        : "Schedule send"}
                    </span>
                    {nextSchedule ? (
                      <StatusBadge tone={nextSchedule.status === "failed" ? "warn" : "waiting"}>
                        {nextSchedule.status}
                      </StatusBadge>
                    ) : null}
                  </div>
                  {nextSchedule?.lastError ? (
                    <p className="schedule-error">{nextSchedule.lastError}</p>
                  ) : null}
                  <div className="schedule-controls">
                    <label htmlFor={`schedule-${draft.uuid}`}>
                      <span className="sr-only">Schedule time</span>
                      <input
                        disabled={!canMutateDrafts || busyUuid === draft.uuid}
                        id={`schedule-${draft.uuid}`}
                        min={toLocalDateTimeInputValue(new Date())}
                        onChange={(event) =>
                          setScheduleInputs((current) => ({
                            ...current,
                            [draft.uuid]: event.target.value,
                          }))
                        }
                        type="datetime-local"
                        value={scheduleInputFor(draft.uuid)}
                      />
                    </label>
                    <button
                      className="ghost-button"
                      disabled={
                        !canMutateDrafts || busyUuid === draft.uuid || schedulingUuid === draft.uuid
                      }
                      onClick={() => void scheduleDraft(draft.uuid, nextSchedule?.id)}
                      title={
                        nextSchedule
                          ? "Replace the current scheduled send time"
                          : "Schedule this draft"
                      }
                      type="button"
                    >
                      {nextSchedule ? "Reschedule" : "Schedule"}
                    </button>
                    {nextSchedule ? (
                      <button
                        className="ghost-button"
                        disabled={
                          !canMutateDrafts ||
                          busyUuid === draft.uuid ||
                          schedulingUuid === draft.uuid
                        }
                        onClick={() => void cancelSchedule(nextSchedule.id, draft.uuid)}
                        title="Cancel this scheduled send"
                        type="button"
                      >
                        Cancel schedule
                      </button>
                    ) : null}
                  </div>
                </div>
                {isRejecting ? (
                  <div className="reject-note-panel">
                    <label htmlFor={`reject-${draft.uuid}`}>
                      Note for future rules review
                      <textarea
                        id={`reject-${draft.uuid}`}
                        onChange={(event) => setRejectFutureNote(event.target.value)}
                        placeholder="Example: For this person, avoid promising exact arrival times unless I said one."
                        rows={3}
                        value={rejectFutureNote}
                      />
                    </label>
                    <span>
                      Stored with this rejection so a later LLM review can decide whether the
                      communication rules for this person should change.
                    </span>
                  </div>
                ) : null}
                <div className="draft-actions">
                  {isRejecting ? (
                    <>
                      <HoldConfirmButton
                        className="action-button"
                        disabled={
                          !canMutateDrafts || busyUuid === draft.uuid || !rejectFutureNote.trim()
                        }
                        confirmingLabel="Keep holding..."
                        onConfirm={() => void rejectDraft(draft.uuid)}
                        title="Reject and queue the note for rules review"
                      >
                        Hold to reject
                      </HoldConfirmButton>
                      <button
                        className="ghost-button"
                        disabled={busyUuid === draft.uuid}
                        onClick={() => {
                          setRejectingUuid(null);
                          setRejectFutureNote("");
                        }}
                        type="button"
                      >
                        Cancel reject
                      </button>
                    </>
                  ) : editingUuid === draft.uuid ? (
                    <>
                      <button
                        className="action-button"
                        disabled={!canMutateDrafts || busyUuid === draft.uuid}
                        onClick={() => void saveDraft(draft.uuid)}
                        title="Save draft text"
                        type="button"
                      >
                        Save
                      </button>
                      <button
                        className="ghost-button"
                        disabled={busyUuid === draft.uuid}
                        onClick={() => {
                          setEditingUuid(null);
                          setEditText("");
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <HoldConfirmButton
                        className="action-button"
                        disabled={
                          !canMutateDrafts || busyUuid === draft.uuid || requiresContextOverride
                        }
                        confirmingLabel="Keep holding..."
                        onConfirm={() => void approveDraft(draft.uuid)}
                        title={
                          requiresContextOverride
                            ? "Context marks this draft do_not_reply; use override to approve"
                            : canMutateDrafts
                              ? "Hold to mark approved for imsg-agent"
                              : "Only admins can approve drafts"
                        }
                      >
                        Hold to approve
                      </HoldConfirmButton>
                      {requiresContextOverride ? (
                        <HoldConfirmButton
                          className="danger-button"
                          disabled={!canMutateDrafts || busyUuid === draft.uuid}
                          confirmingLabel="Keep holding..."
                          onConfirm={() => void approveDraft(draft.uuid, true)}
                          title="Audit an explicit context override and queue this draft"
                        >
                          Override context
                        </HoldConfirmButton>
                      ) : null}
                      <button
                        className="ghost-button"
                        disabled={!canMutateDrafts || busyUuid === draft.uuid}
                        onClick={() => beginEdit(draft)}
                        title={canMutateDrafts ? "Edit draft text" : "Only admins can edit drafts"}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canMutateDrafts || busyUuid === draft.uuid}
                        onClick={() => {
                          setActionError(null);
                          setRejectingUuid(draft.uuid);
                          setRejectFutureNote("");
                        }}
                        title={
                          canMutateDrafts ? "Remove this draft" : "Only admins can reject drafts"
                        }
                        type="button"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function defaultContextDraft(scope: "contact" | "conversation"): ContextRecordView {
  const draft: ContextRecordView = {
    allowedPersonalDetails: [],
    customPersonalDetails: [],
    customPrompt: "",
    displayName: "",
    id: "",
    notes: "",
    relationship: "unknown",
    replyPosture: "reply_if_needed",
    tenantId: "",
    tone: "warm",
    updatedAt: "",
  };

  if (scope === "conversation") {
    draft.channelId = "imessage";
    draft.roomKey = "";
  } else {
    draft.contactKey = "";
  }

  return draft;
}

function ContextView({
  canEditContext,
  data,
  error,
  loading,
  onRefresh,
}: {
  canEditContext: boolean;
  data: ContextDataView | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState(defaultContextDraft("contact"));
  const [conversationDraft, setConversationDraft] = useState(defaultContextDraft("conversation"));
  const [hiddenSuggestions, setHiddenSuggestions] = useState<Set<string>>(new Set());

  async function saveContext(scope: "contact" | "conversation", draft: ContextRecordView) {
    setActionError(null);

    try {
      const response = await fetchWithTimeout("/api/context", {
        body: JSON.stringify({ ...draft, scope }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save context");
      }

      if (scope === "contact") {
        setContactDraft(defaultContextDraft("contact"));
      } else {
        setConversationDraft(defaultContextDraft("conversation"));
      }

      await onRefresh();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "Could not save context");
    }
  }

  function toggleDetail(
    draft: ContextRecordView,
    setDraft: (draft: ContextRecordView) => void,
    detail: string,
  ) {
    const current = new Set(draft.allowedPersonalDetails);

    if (current.has(detail)) {
      current.delete(detail);
    } else {
      current.add(detail);
    }

    setDraft({ ...draft, allowedPersonalDetails: [...current] });
  }

  function applySuggestion(suggestion: ContextSuggestionView) {
    const targetKey = suggestion.targetKey.replace(/^imessage:/, "");
    const next = {
      ...defaultContextDraft(suggestion.contextType),
      allowedPersonalDetails: suggestion.payload.allowedPersonalDetails,
      customPrompt: suggestion.payload.customPrompt,
      displayName: suggestion.payload.displayName,
      relationship: suggestion.payload.relationship,
      replyPosture: suggestion.payload.replyPosture,
      tone: suggestion.payload.tone,
    };

    if (suggestion.contextType === "contact") {
      setContactDraft({ ...next, contactKey: suggestion.targetKey });
    } else {
      setConversationDraft({ ...next, channelId: "imessage", roomKey: targetKey });
    }
  }

  const suggestions =
    data?.suggestions.filter((suggestion) => !hiddenSuggestions.has(suggestion.targetKey)) ?? [];

  return (
    <section className="content-band context-layout" aria-labelledby="context-heading">
      <div className="section-heading">
        <h2 id="context-heading">Context</h2>
        <button
          className="ghost-button icon-button"
          disabled={loading}
          onClick={() => void onRefresh()}
          title="Refresh context"
          type="button"
        >
          <RefreshCw aria-label="Refresh context" size={16} />
        </button>
      </div>
      {actionError ? <p className="draft-action-error">{actionError}</p> : null}
      {error ? (
        <EmptyState
          action={
            <button className="action-button" onClick={() => void onRefresh()} type="button">
              <RefreshCw aria-hidden size={17} />
              Retry
            </button>
          }
          icon={<Tag aria-hidden size={24} />}
          message={error}
          title="Could not load context"
        />
      ) : null}
      {loading ? (
        <EmptyState
          icon={<Tag aria-hidden size={24} />}
          message="Loading saved profiles and harvest suggestions."
          title="Loading context"
        />
      ) : null}
      {!error && !loading ? (
        <>
          <div className="context-editor-grid">
            <ContextEditor
              canEditContext={canEditContext}
              draft={contactDraft}
              keyField="contactKey"
              keyLabel="Contact key"
              onChange={setContactDraft}
              onSave={() => void saveContext("contact", contactDraft)}
              onToggleDetail={(detail) => toggleDetail(contactDraft, setContactDraft, detail)}
              title="Contact Context"
            />
            <ContextEditor
              canEditContext={canEditContext}
              draft={conversationDraft}
              keyField="roomKey"
              keyLabel="Room key"
              onChange={setConversationDraft}
              onSave={() => void saveContext("conversation", conversationDraft)}
              onToggleDetail={(detail) =>
                toggleDetail(conversationDraft, setConversationDraft, detail)
              }
              title="Conversation Context"
            />
          </div>
          <div className="context-columns">
            <ContextList
              records={data?.contactContexts ?? []}
              title="Saved Contacts"
              onEdit={(record) => setContactDraft(record)}
            />
            <ContextList
              records={data?.conversationContexts ?? []}
              title="Saved Rooms"
              onEdit={(record) => setConversationDraft(record)}
            />
          </div>
          <section className="context-suggestions" aria-labelledby="context-suggestions-heading">
            <div className="section-heading">
              <h3 id="context-suggestions-heading">Harvest Suggestions</h3>
              {data?.harvestError ? <span>{data.harvestError}</span> : null}
            </div>
            {suggestions.length === 0 ? (
              <p className="muted-line">No harvest suggestions are visible right now.</p>
            ) : (
              <div className="draft-grid">
                {suggestions.slice(0, 8).map((suggestion) => (
                  <article className="context-suggestion-card" key={suggestion.targetKey}>
                    <div className="draft-card-top">
                      <span>
                        <strong>{suggestion.payload.displayName}</strong>
                        <span>
                          {suggestion.contextType} · confidence{" "}
                          {Math.round(suggestion.confidence * 100)}%
                        </span>
                      </span>
                      <StatusBadge tone="waiting">review</StatusBadge>
                    </div>
                    <dl className="draft-meta">
                      <div>
                        <dt>Relationship</dt>
                        <dd>{suggestion.payload.relationship}</dd>
                      </div>
                      <div>
                        <dt>Tone</dt>
                        <dd>{suggestion.payload.tone}</dd>
                      </div>
                      <div>
                        <dt>Posture</dt>
                        <dd>{suggestion.payload.replyPosture}</dd>
                      </div>
                    </dl>
                    <ul className="context-evidence">
                      {suggestion.evidence.map((evidence) => (
                        <li key={evidence.rowid}>
                          <strong>{evidence.rowid}</strong>
                          <span>{evidence.snippet}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="draft-actions">
                      <button
                        className="action-button"
                        disabled={!canEditContext}
                        onClick={() => applySuggestion(suggestion)}
                        type="button"
                      >
                        Edit suggestion
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() =>
                          setHiddenSuggestions((current) =>
                            new Set(current).add(suggestion.targetKey),
                          )
                        }
                        type="button"
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

function ContextEditor({
  canEditContext,
  draft,
  keyField,
  keyLabel,
  onChange,
  onSave,
  onToggleDetail,
  title,
}: {
  canEditContext: boolean;
  draft: ContextRecordView;
  keyField: "contactKey" | "roomKey";
  keyLabel: string;
  onChange: (draft: ContextRecordView) => void;
  onSave: () => void;
  onToggleDetail: (detail: string) => void;
  title: string;
}) {
  return (
    <section className="context-editor" aria-label={title}>
      <h3>{title}</h3>
      <label>
        <span>{keyLabel}</span>
        <input
          onChange={(event) => onChange({ ...draft, [keyField]: event.target.value })}
          value={draft[keyField] ?? ""}
        />
      </label>
      <label>
        <span>Display name</span>
        <input
          onChange={(event) => onChange({ ...draft, displayName: event.target.value })}
          value={draft.displayName}
        />
      </label>
      <div className="context-choice-row">
        <label>
          <span>Relationship</span>
          <select
            onChange={(event) => onChange({ ...draft, relationship: event.target.value })}
            value={draft.relationship}
          >
            {contextRelationships.map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Tone</span>
          <select
            onChange={(event) => onChange({ ...draft, tone: event.target.value })}
            value={draft.tone}
          >
            {contextTones.map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Reply posture</span>
          <select
            onChange={(event) => onChange({ ...draft, replyPosture: event.target.value })}
            value={draft.replyPosture}
          >
            {contextReplyPostures.map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="context-detail-options">
        <legend>Allowed details</legend>
        {personalDetailChoices.map((detail) => (
          <label key={detail}>
            <input
              checked={draft.allowedPersonalDetails.includes(detail)}
              onChange={() => onToggleDetail(detail)}
              type="checkbox"
            />
            <span>{detail}</span>
          </label>
        ))}
      </fieldset>
      <label>
        <span>Custom prompt</span>
        <textarea
          onChange={(event) => onChange({ ...draft, customPrompt: event.target.value })}
          rows={3}
          value={draft.customPrompt}
        />
      </label>
      <label>
        <span>Notes</span>
        <textarea
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
          rows={3}
          value={draft.notes}
        />
      </label>
      <button className="action-button" disabled={!canEditContext} onClick={onSave} type="button">
        Save
      </button>
    </section>
  );
}

function ContextList({
  onEdit,
  records,
  title,
}: {
  onEdit: (record: ContextRecordView) => void;
  records: ContextRecordView[];
  title: string;
}) {
  return (
    <section className="context-list" aria-label={title}>
      <h3>{title}</h3>
      {records.length === 0 ? <p className="muted-line">No saved records yet.</p> : null}
      {records.map((record) => (
        <button
          className="context-list-item"
          key={record.id}
          onClick={() => onEdit(record)}
          type="button"
        >
          <strong>{record.displayName || record.contactKey || record.roomKey}</strong>
          <span>
            {record.relationship} · {record.tone} · {record.replyPosture}
          </span>
        </button>
      ))}
    </section>
  );
}

function People() {
  return (
    <section className="content-band" aria-labelledby="people-heading">
      <div className="section-heading">
        <h2 id="people-heading">People</h2>
        <button
          className="action-button"
          disabled
          title="Auth and invite flow are not wired yet"
          type="button"
        >
          <UserPlus aria-hidden size={17} />
          Invite
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>First admin</td>
              <td>admin</td>
              <td>
                <StatusBadge tone="waiting">
                  <CircleDashed aria-hidden size={15} />
                  Seed pending
                </StatusBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsView({ mode, onSelectMode }: { mode: Mode; onSelectMode: (mode: Mode) => void }) {
  return (
    <section className="content-band settings-grid" aria-labelledby="settings-heading">
      <div className="section-heading settings-heading">
        <h2 id="settings-heading">Interface</h2>
      </div>
      <div className="setting-row">
        <span>
          <strong>Mode</strong>
          <span>
            Essentials keeps the workspace compact; Power shows the full operator surface.
          </span>
        </span>
        <fieldset className="mode-toggle">
          <legend className="sr-only">Interface mode</legend>
          <button
            aria-pressed={mode === "essentials"}
            onClick={() => onSelectMode("essentials")}
            type="button"
          >
            Essentials
          </button>
          <button
            aria-pressed={mode === "power"}
            onClick={() => onSelectMode("power")}
            type="button"
          >
            Power
          </button>
        </fieldset>
      </div>
      <div className="setting-row">
        <span>
          <strong>iMessage</strong>
          <span>Read-only adapter setup is queued.</span>
        </span>
        <button
          className="action-button"
          disabled
          title="iMessage adapter is not connected yet"
          type="button"
        >
          Configure
        </button>
      </div>
    </section>
  );
}

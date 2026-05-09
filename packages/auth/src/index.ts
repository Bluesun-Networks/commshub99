// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { DbClient, User } from "@commshub99/db";
import { createDbClient, sessions, tenants, tenantUsers, users } from "@commshub99/db";
import { eq } from "drizzle-orm";

export const SESSION_COOKIE_NAME = "commshub99_session";
export const SESSION_TTL_DAYS = 30;

export type PublicUser = Pick<User, "email" | "id" | "name" | "role">;

export interface AuthSession {
  expiresAt: Date;
  token: string;
  user: PublicUser;
}

export interface BootstrapAdminInput {
  email: string;
  name?: string;
  password: string;
  tenantName?: string;
}

export interface SignInInput {
  email: string;
  ipAddress?: string | null;
  password: string;
  userAgent?: string | null;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt;
}

function toPublicUser(user: User): PublicUser {
  return {
    email: user.email,
    id: user.id,
    name: user.name,
    role: user.role,
  };
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");

  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split("$");

  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function ensureAuthTables(client: DbClient) {
  client.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY NOT NULL,
      email text NOT NULL,
      name text NOT NULL,
      password_hash text NOT NULL,
      role text DEFAULT 'readonly' NOT NULL,
      created_at integer NOT NULL,
      last_login_at integer,
      disabled integer DEFAULT false NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);

    CREATE TABLE IF NOT EXISTS sessions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      token text NOT NULL,
      expires_at integer NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      ip_address text,
      user_agent text,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_unique ON sessions (token);

    CREATE TABLE IF NOT EXISTS tenants (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      owner_user_id text NOT NULL,
      created_at integer NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE restrict
    );
    CREATE INDEX IF NOT EXISTS tenants_owner_user_id_idx ON tenants (owner_user_id);

    CREATE TABLE IF NOT EXISTS tenant_users (
      tenant_id text NOT NULL,
      user_id text NOT NULL,
      role text DEFAULT 'readonly' NOT NULL,
      created_at integer NOT NULL,
      PRIMARY KEY(tenant_id, user_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE cascade,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS tenant_users_user_id_idx ON tenant_users (user_id);
  `);
}

export function getAuthBootstrapState() {
  const client = createDbClient();

  try {
    ensureAuthTables(client);

    const count = client.sqlite.prepare("SELECT count(*) AS count FROM users").get() as {
      count: number;
    };

    return {
      needsBootstrap: count.count === 0,
      userCount: count.count,
    };
  } finally {
    client.close();
  }
}

function createSession(
  client: DbClient,
  user: User,
  details: Pick<SignInInput, "ipAddress" | "userAgent"> = {},
): AuthSession {
  const now = new Date();
  const expiresAt = sessionExpiry();
  const token = randomBytes(32).toString("base64url");

  client.db
    .insert(sessions)
    .values({
      createdAt: now,
      expiresAt,
      id: randomUUID(),
      ipAddress: details.ipAddress ?? null,
      token,
      updatedAt: now,
      userAgent: details.userAgent ?? null,
      userId: user.id,
    })
    .run();

  return {
    expiresAt,
    token,
    user: toPublicUser(user),
  };
}

export function bootstrapAdmin(input: BootstrapAdminInput): AuthSession {
  const email = normalizeEmail(input.email);
  const password = input.password.trim();

  if (!email.includes("@")) {
    throw new Error("Enter a valid email address.");
  }

  if (password.length < 12) {
    throw new Error("Use a password with at least 12 characters.");
  }

  const client = createDbClient();

  try {
    ensureAuthTables(client);

    const existing = client.sqlite.prepare("SELECT count(*) AS count FROM users").get() as {
      count: number;
    };

    if (existing.count > 0) {
      throw new Error("The first admin has already been created.");
    }

    const now = new Date();
    const userId = randomUUID();
    const tenantId = randomUUID();
    const user = {
      createdAt: now,
      disabled: false,
      email,
      id: userId,
      lastLoginAt: now,
      name: input.name?.trim() || email,
      passwordHash: hashPassword(password),
      role: "admin" as const,
    };

    client.db.insert(users).values(user).run();
    client.db
      .insert(tenants)
      .values({
        createdAt: now,
        id: tenantId,
        name: input.tenantName?.trim() || "Home",
        ownerUserId: userId,
      })
      .run();
    client.db
      .insert(tenantUsers)
      .values({
        createdAt: now,
        role: "admin",
        tenantId,
        userId,
      })
      .run();

    return createSession(client, user);
  } finally {
    client.close();
  }
}

export function signIn(input: SignInInput): AuthSession {
  const email = normalizeEmail(input.email);
  const client = createDbClient();

  try {
    ensureAuthTables(client);

    const user = client.db.select().from(users).where(eq(users.email, email)).get();

    if (!user || user.disabled || !verifyPassword(input.password, user.passwordHash)) {
      throw new Error("Email or password is incorrect.");
    }

    client.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id)).run();

    return createSession(client, user, input);
  } finally {
    client.close();
  }
}

export function getSessionByToken(token: string | undefined | null): AuthSession | null {
  if (!token) {
    return null;
  }

  const client = createDbClient();

  try {
    ensureAuthTables(client);

    const row = client.db
      .select({
        email: users.email,
        expiresAt: sessions.expiresAt,
        id: users.id,
        name: users.name,
        role: users.role,
        token: sessions.token,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.token, token))
      .get();

    if (!row || row.expiresAt <= new Date()) {
      return null;
    }

    return {
      expiresAt: row.expiresAt,
      token: row.token,
      user: {
        email: row.email,
        id: row.id,
        name: row.name,
        role: row.role,
      },
    };
  } finally {
    client.close();
  }
}

export function destroySession(token: string | undefined | null) {
  if (!token) {
    return;
  }

  const client = createDbClient();

  try {
    ensureAuthTables(client);
    client.db.delete(sessions).where(eq(sessions.token, token)).run();
  } finally {
    client.close();
  }
}

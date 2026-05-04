// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDbClient } from "./client.js";
import { tenants, tenantUsers, users } from "./schema/index.js";

const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();

if (!initialAdminEmail) {
  console.error("INITIAL_ADMIN_EMAIL is required to seed the first admin.");
  process.exit(1);
}

const adminName = process.env.INITIAL_ADMIN_NAME?.trim() || initialAdminEmail;
const passwordHash = process.env.INITIAL_ADMIN_PASSWORD_HASH ?? "pending-better-auth-bootstrap";
const defaultTenantName = process.env.INITIAL_TENANT_NAME?.trim() || "Home";

const client = createDbClient();

try {
  const existingAdmin = client.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, initialAdminEmail))
    .get();

  const adminId = existingAdmin?.id ?? randomUUID();

  if (!existingAdmin) {
    client.db
      .insert(users)
      .values({
        id: adminId,
        email: initialAdminEmail,
        name: adminName,
        passwordHash,
        role: "admin",
      })
      .run();
  }

  const existingTenant = client.db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.ownerUserId, adminId))
    .get();

  const tenantId = existingTenant?.id ?? randomUUID();

  if (!existingTenant) {
    client.db
      .insert(tenants)
      .values({
        id: tenantId,
        name: defaultTenantName,
        ownerUserId: adminId,
      })
      .run();
  }

  client.db
    .insert(tenantUsers)
    .values({
      tenantId,
      userId: adminId,
      role: "admin",
    })
    .onConflictDoNothing()
    .run();

  console.log(`Seeded admin ${initialAdminEmail} in ${client.path}`);
} finally {
  client.close();
}

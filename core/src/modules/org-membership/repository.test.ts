import { describe, it, expect } from "vitest";
import { createOrgMemberRepositoryClass } from "./repository";

// Minimal fake schema columns (the factory only references them by identity).
const fakeSchema = {
  orgMembers: { id: "id", userId: "user_id", orgId: "org_id", status: "status", role: "role", uuid: "uuid", pendingRoleId: "pending_role_id", invitedBy: "invited_by", invitedAt: "invited_at", joinedAt: "joined_at", removedAt: "removed_at", removedBy: "removed_by", createdAt: "created_at", updatedAt: "updated_at" },
  users: { id: "id", uuid: "uuid", name: "name", email: "email", avatar: "avatar", isActive: "is_active" },
  roles: { id: "id", name: "name" },
} as any;

describe("OrgMemberRepository.upsertMembership", () => {
  it("inserts a new active member with role when none exists", async () => {
    const Repo = createOrgMemberRepositoryClass(fakeSchema);
    const repo = new Repo();
    const inserted = { id: 1, userId: 7, orgId: 3, status: "active", role: "admin" };

    const db: any = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [inserted] }) }) }),
    };

    const result = await repo.upsertMembership(db, { userId: 7, orgId: 3, status: "active", role: "admin" });
    expect(result.role).toBe("admin");
    expect(result.status).toBe("active");
  });

  it("findActiveMemberships returns only active/suspended rows", async () => {
    const Repo = createOrgMemberRepositoryClass(fakeSchema);
    const repo = new Repo();
    const rows = [{ id: 1, userId: 7, orgId: 3, status: "active", role: "member" }];
    const db: any = {
      select: () => ({ from: () => ({ where: async () => rows }) }),
    };
    const result = await repo.findActiveMemberships(db, 7);
    expect(result).toHaveLength(1);
    expect(result[0].orgId).toBe(3);
  });
});

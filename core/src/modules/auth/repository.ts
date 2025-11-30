/**
 * Auth Repository
 *
 * Generic repository for authentication-related database operations.
 * This is a factory that creates a repository class with injected schema dependencies.
 *
 * @module @yobolabs/core/auth
 */

import { and, eq, isNull, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PgTable } from 'drizzle-orm/pg-core';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * User record as stored in database
 */
export interface AuthUserRecord {
  id: number;
  uuid: string;
  email: string;
  name: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  password: string | null;
  avatar: string | null;
  currentOrgId: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User role assignment with related data
 */
export interface AuthUserRoleAssignment {
  orgId: number | null;
  isActive: boolean;
  org: { id: number; name: string } | null;
  role: {
    id: number;
    name: string;
    rolePermissions?: Array<{
      permission: {
        id: number;
        slug: string;
        name: string;
        description: string | null;
      };
    }>;
  };
}

/**
 * Data for registering a new user
 */
export interface AuthRegisterUserData {
  email: string;
  password: string;
  name: string;
}

/**
 * Data for updating user profile
 */
export interface AuthUpdateProfileData {
  name?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Schema dependencies for the auth repository
 */
export interface AuthRepositorySchema {
  users: PgTable & {
    id: any;
    email: any;
    password: any;
    name: any;
    username: any;
    firstName: any;
    lastName: any;
    isActive: any;
  };
  userRoles: PgTable & {
    userId: any;
    orgId: any;
    isActive: any;
  };
}

// =============================================================================
// REPOSITORY FACTORY
// =============================================================================

/**
 * Create an Auth Repository class with injected schema dependencies.
 *
 * This factory pattern allows apps to inject their own schema while
 * reusing the repository logic from core.
 *
 * @example
 * ```typescript
 * import { createAuthRepositoryClass } from '@yobolabs/core/auth';
 * import { users, userRoles } from '@/db/schema';
 *
 * const AuthRepository = createAuthRepositoryClass({ users, userRoles });
 *
 * // Use in router
 * const repo = new AuthRepository(db);
 * const user = await repo.findByEmail('test@example.com');
 * ```
 */
export function createAuthRepositoryClass(schema: AuthRepositorySchema) {
  return class AuthRepository {
    /** @internal */
    readonly _db: PostgresJsDatabase<any>;

    constructor(db: PostgresJsDatabase<any>) {
      this._db = db;
    }

    /**
     * Find user by email
     */
    async findByEmail(email: string): Promise<AuthUserRecord | null> {
      const [user] = await this._db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);

      return (user as unknown as AuthUserRecord) || null;
    }

    /**
     * Find user by ID
     */
    async findById(id: number): Promise<AuthUserRecord | null> {
      const [user] = await this._db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, id))
        .limit(1);

      return (user as unknown as AuthUserRecord) || null;
    }

    /**
     * Create new user (registration)
     */
    async createUser(data: AuthRegisterUserData): Promise<AuthUserRecord> {
      const [user] = await this._db
        .insert(schema.users)
        .values({
          email: data.email,
          password: data.password,
          name: data.name,
          isActive: true,
        } as any)
        .returning();

      return user as unknown as AuthUserRecord;
    }

    /**
     * Update user profile
     */
    async updateProfile(userId: number, data: AuthUpdateProfileData): Promise<AuthUserRecord | null> {
      const [user] = await this._db
        .update(schema.users)
        .set({
          ...data,
          updatedAt: new Date(),
        } as any)
        .where(eq(schema.users.id, userId))
        .returning();

      return (user as unknown as AuthUserRecord) || null;
    }

    /**
     * Get all active role assignments for a user
     */
    async getUserRoleAssignments(userId: number): Promise<any[]> {
      const assignments = await (this._db as any).query.userRoles.findMany({
        where: and(
          eq(schema.userRoles.userId, userId),
          eq(schema.userRoles.isActive, true)
        ),
        with: {
          org: {
            columns: { id: true, name: true }
          },
          role: {
            columns: { id: true, name: true }
          }
        }
      });

      return assignments;
    }

    /**
     * Get user role assignments with permissions
     */
    async getUserRoleAssignmentsWithPermissions(
      userId: number,
      currentOrgId: number | null
    ): Promise<any[]> {
      // Build where clause based on org context
      let whereClause;

      if (currentOrgId) {
        whereClause = and(
          eq(schema.userRoles.userId, userId),
          or(
            eq(schema.userRoles.orgId, currentOrgId),
            isNull(schema.userRoles.orgId) // System roles
          ),
          eq(schema.userRoles.isActive, true)
        );
      } else {
        whereClause = and(
          eq(schema.userRoles.userId, userId),
          isNull(schema.userRoles.orgId), // System roles only
          eq(schema.userRoles.isActive, true)
        );
      }

      const assignments = await (this._db as any).query.userRoles.findMany({
        where: whereClause,
        with: {
          org: {
            columns: { id: true, name: true }
          },
          role: {
            with: {
              rolePermissions: {
                with: {
                  permission: {
                    columns: { id: true, slug: true, name: true, description: true }
                  }
                }
              }
            }
          }
        }
      });

      return assignments;
    }
  };
}

/**
 * Interface for the Auth Repository instance
 */
export interface IAuthRepository {
  findByEmail(email: string): Promise<AuthUserRecord | null>;
  findById(id: number): Promise<AuthUserRecord | null>;
  createUser(data: AuthRegisterUserData): Promise<AuthUserRecord>;
  updateProfile(userId: number, data: AuthUpdateProfileData): Promise<AuthUserRecord | null>;
  getUserRoleAssignments(userId: number): Promise<any[]>;
  getUserRoleAssignmentsWithPermissions(userId: number, currentOrgId: number | null): Promise<any[]>;
}

// =============================================================================
// SDK PRE-BUILT REPOSITORY
// =============================================================================

/**
 * SDK Auth Repository schema - uses SDK's own schema tables.
 * Loaded lazily to avoid circular dependencies.
 */
let _sdkAuthSchema: AuthRepositorySchema | null = null;

function getSDKAuthSchema(): AuthRepositorySchema {
  if (!_sdkAuthSchema) {
    // Lazy load to avoid circular dependency
    const schema = require('../../db/schema');
    _sdkAuthSchema = {
      users: schema.users,
      userRoles: schema.userRoles,
    };
  }
  return _sdkAuthSchema;
}

/**
 * Pre-built Auth Repository class using SDK's schema.
 *
 * This is a zero-config class for apps that use the SDK's standard schema.
 * For apps with custom schema, use `createAuthRepositoryClass` instead.
 *
 * @example
 * ```typescript
 * import { SDKAuthRepository } from '@yobolabs/core/auth';
 * import { createAuthRouterConfig } from '@yobolabs/core/auth';
 * import bcrypt from 'bcrypt';
 *
 * const authRouterConfig = createAuthRouterConfig({
 *   Repository: SDKAuthRepository,
 *   hashPassword: (password) => bcrypt.hash(password, 12),
 *   getPrivilegedDb: () => privilegedDb,
 *   schema: { users, userRoles },
 * });
 * ```
 */
export const SDKAuthRepository = class SDKAuthRepository implements IAuthRepository {
  /** @internal */
  readonly _db: PostgresJsDatabase<any>;

  constructor(db: PostgresJsDatabase<any>) {
    this._db = db;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    const schema = getSDKAuthSchema();
    const [user] = await this._db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    return (user as unknown as AuthUserRecord) || null;
  }

  /**
   * Find user by ID
   */
  async findById(id: number): Promise<AuthUserRecord | null> {
    const schema = getSDKAuthSchema();
    const [user] = await this._db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    return (user as unknown as AuthUserRecord) || null;
  }

  /**
   * Create new user (registration)
   */
  async createUser(data: AuthRegisterUserData): Promise<AuthUserRecord> {
    const schema = getSDKAuthSchema();
    const [user] = await this._db
      .insert(schema.users)
      .values({
        email: data.email,
        password: data.password,
        name: data.name,
        isActive: true,
      } as any)
      .returning();

    return user as unknown as AuthUserRecord;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: number, data: AuthUpdateProfileData): Promise<AuthUserRecord | null> {
    const schema = getSDKAuthSchema();
    const [user] = await this._db
      .update(schema.users)
      .set({
        ...data,
        updatedAt: new Date(),
      } as any)
      .where(eq(schema.users.id, userId))
      .returning();

    return (user as unknown as AuthUserRecord) || null;
  }

  /**
   * Get all active role assignments for a user
   */
  async getUserRoleAssignments(userId: number): Promise<any[]> {
    const schema = getSDKAuthSchema();
    const assignments = await (this._db as any).query.userRoles.findMany({
      where: and(
        eq(schema.userRoles.userId, userId),
        eq(schema.userRoles.isActive, true)
      ),
      with: {
        org: {
          columns: { id: true, name: true }
        },
        role: {
          columns: { id: true, name: true }
        }
      }
    });

    return assignments;
  }

  /**
   * Get user role assignments with permissions
   */
  async getUserRoleAssignmentsWithPermissions(
    userId: number,
    currentOrgId: number | null
  ): Promise<any[]> {
    const schema = getSDKAuthSchema();

    // Build where clause based on org context
    let whereClause;

    if (currentOrgId) {
      whereClause = and(
        eq(schema.userRoles.userId, userId),
        or(
          eq(schema.userRoles.orgId, currentOrgId),
          isNull(schema.userRoles.orgId) // System roles
        ),
        eq(schema.userRoles.isActive, true)
      );
    } else {
      whereClause = and(
        eq(schema.userRoles.userId, userId),
        isNull(schema.userRoles.orgId), // System roles only
        eq(schema.userRoles.isActive, true)
      );
    }

    const assignments = await (this._db as any).query.userRoles.findMany({
      where: whereClause,
      with: {
        org: {
          columns: { id: true, name: true }
        },
        role: {
          with: {
            rolePermissions: {
              with: {
                permission: {
                  columns: { id: true, slug: true, name: true, description: true }
                }
              }
            }
          }
        }
      }
    });

    return assignments;
  }
};

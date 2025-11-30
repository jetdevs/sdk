# Extension Development Guide

This guide explains how to create, structure, and maintain extensions for the SaaS Core framework.

## Critical Requirements

> **READ THESE FIRST** - Violating these rules will cause runtime errors or security issues.

### 1. Router Creation: Use `createRouterWithActor` ONLY

```typescript
// ✅ REQUIRED: Use createRouterWithActor
import { createRouterWithActor } from '@yobo/saas-core/trpc'

export const myRouter = createRouterWithActor({
  list: {
    type: 'query',
    permission: 'my:read',  // Always specify permission
    handler: async ({ ctx }) => { ... }
  }
})

// ❌ FORBIDDEN: Never use bare router()
import { router, protectedProcedure } from '@trpc/server'
export const myRouter = router({
  list: protectedProcedure.query(...) // WRONG - loses actor context
})
```

### 2. Permission Namespacing: Prefix with Extension Name

```typescript
// ✅ GOOD: Namespaced permissions
'projects:create'
'projects:read'
'invoices:generate'

// ❌ BAD: Generic names cause collisions
'create'        // Will collide
'read'          // Will collide
'admin:manage'  // Collides with core
```

### 3. Permission Collisions Are Fatal

Extensions **cannot** override core permissions. Collisions throw errors at startup:

```
Error: Permission collision: "admin:manage" already exists.
Set allowOverride: true to override, or use a unique key.
```

### 4. Database Tables Must Have `org_id`

Every extension table needs `org_id` for RLS:

```typescript
export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull().references(() => schema.orgs.id), // REQUIRED
  // ... other columns
})
```

---

## What is an Extension?

An **extension** is a self-contained feature module that adds functionality to your SaaS application without modifying the core framework. Extensions can include:

- Database tables (schema)
- Permissions
- API endpoints (tRPC routers)
- UI components
- Business logic (services)
- Row-Level Security policies

## Extension Structure

```
src/extensions/
└── my-feature/
    ├── index.ts           # Extension definition (required)
    ├── schema.ts          # Database tables
    ├── permissions.ts     # Permission definitions
    ├── router.ts          # tRPC router
    ├── repository.ts      # Data access layer
    ├── service.ts         # Business logic
    ├── rls.ts             # RLS configuration
    ├── types.ts           # TypeScript types
    ├── components/        # React components
    │   ├── index.ts
    │   ├── FeatureList.tsx
    │   ├── FeatureForm.tsx
    │   └── FeatureCard.tsx
    ├── hooks/             # React hooks
    │   └── useFeature.ts
    └── __tests__/         # Tests
        ├── router.test.ts
        └── service.test.ts
```

## Creating an Extension

### Step 1: Define the Extension

Every extension starts with an `index.ts` that registers it with the core:

```typescript
// src/extensions/projects/index.ts

import { defineExtension } from '@yobo/saas-core'
import * as schema from './schema'
import { permissions } from './permissions'
import { projectsRouter } from './router'
import { rlsConfig } from './rls'

export const projectsExtension = defineExtension({
  name: 'projects',
  version: '1.0.0',

  // Database tables
  schema,

  // Permission definitions
  permissions,

  // API router
  router: projectsRouter,

  // RLS configuration
  rls: rlsConfig,

  // Optional lifecycle hooks
  hooks: {
    onInstall: async () => {
      console.log('Projects extension installed')
    },
    onEnable: async () => {
      console.log('Projects extension enabled')
    },
  },

  // Optional seed data
  seeds: async () => {
    // Seed default data
  },
})
```

### Step 2: Define Database Schema

Use Drizzle ORM to define your tables:

```typescript
// src/extensions/projects/schema.ts

import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { schema } from '@yobo/saas-core'

// Main projects table
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => schema.orgs.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => schema.users.id),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['draft', 'active', 'completed', 'archived'] })
    .notNull()
    .default('draft'),
  settings: jsonb('settings').$type<ProjectSettings>(),
  priority: integer('priority').default(0),
  dueDate: timestamp('due_date'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Project members (many-to-many with users)
export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => schema.users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'admin', 'member', 'viewer'] })
    .notNull()
    .default('member'),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
})

// Project tasks
export const projectTasks = pgTable('project_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  assigneeId: uuid('assignee_id').references(() => schema.users.id),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['todo', 'in_progress', 'review', 'done'] })
    .notNull()
    .default('todo'),
  priority: integer('priority').default(0),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Define relations (for Drizzle query builder)
export const projectsRelations = relations(projects, ({ one, many }) => ({
  org: one(schema.orgs, {
    fields: [projects.orgId],
    references: [schema.orgs.id],
  }),
  owner: one(schema.users, {
    fields: [projects.ownerId],
    references: [schema.users.id],
  }),
  members: many(projectMembers),
  tasks: many(projectTasks),
}))

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(schema.users, {
    fields: [projectMembers.userId],
    references: [schema.users.id],
  }),
}))

// TypeScript types
export interface ProjectSettings {
  color?: string
  icon?: string
  visibility?: 'public' | 'private' | 'team'
  notifications?: {
    onTaskComplete?: boolean
    onMemberJoin?: boolean
  }
}
```

### Step 3: Define Permissions

> **IMPORTANT**: Permission keys MUST be namespaced with extension name to avoid collisions.
> Collisions with core or other extensions cause fatal errors at startup.

Create permissions for your feature:

```typescript
// src/extensions/projects/permissions.ts

import type { PermissionModule } from '@yobo/saas-core'

export const permissions: PermissionModule = {
  name: 'projects',           // Module name (used for grouping)
  displayName: 'Projects',
  description: 'Project management permissions',
  permissions: {
    // ✅ All keys prefixed with 'project:' to avoid collisions

    // Basic CRUD
    'project:create': {
      name: 'Create Project',
      description: 'Create new projects in the organization',
    },
    'project:read': {
      name: 'View Projects',
      description: 'View project details and list',
    },
    'project:update': {
      name: 'Update Project',
      description: 'Modify project settings and details',
    },
    'project:delete': {
      name: 'Delete Project',
      description: 'Permanently delete projects',
    },

    // Member management
    'project:manage_members': {
      name: 'Manage Members',
      description: 'Add and remove project members',
    },

    // Task management
    'project:manage_tasks': {
      name: 'Manage Tasks',
      description: 'Create, update, and delete tasks',
    },
    'project:assign_tasks': {
      name: 'Assign Tasks',
      description: 'Assign tasks to team members',
    },

    // Advanced
    'project:archive': {
      name: 'Archive Project',
      description: 'Archive and restore projects',
    },
    'project:export': {
      name: 'Export Data',
      description: 'Export project data to various formats',
    },
  },
}

// Type-safe permission keys (for use in router and UI)
export type ProjectPermission = keyof typeof permissions.permissions
```

### Permission Collision Rules

| Scenario | Result |
|----------|--------|
| Extension adds `project:create` (new) | ✅ Allowed |
| Extension adds `admin:manage` (core key) | ❌ **Fatal Error** |
| Two extensions both add `workflow:create` | ❌ **Fatal Error** |
| Extension uses module name `admin` | ⚠️ Keys merged, must be unique |

### Reserved Permission Prefixes

These prefixes are reserved for core - do NOT use them:

```
admin:*
org:*
user:*
role:*
system:*
```

### Step 4: Create RLS Configuration

Define Row-Level Security policies:

```typescript
// src/extensions/projects/rls.ts

import type { RlsTableConfig } from '@yobo/saas-core'

export const rlsConfig: RlsTableConfig[] = [
  {
    tableName: 'projects',
    orgIdColumn: 'org_id',
    policies: {
      select: true,
      insert: true,
      update: true,
      delete: true,
    },
  },
  {
    tableName: 'project_members',
    // project_members doesn't have org_id directly
    // Use custom policy to join through projects table
    customPolicies: [
      `CREATE POLICY "project_members_org_isolation" ON project_members
       FOR ALL USING (
         project_id IN (
           SELECT id FROM projects
           WHERE org_id = current_setting('rls.current_org_id')::uuid
         )
       )`,
    ],
  },
  {
    tableName: 'project_tasks',
    customPolicies: [
      `CREATE POLICY "project_tasks_org_isolation" ON project_tasks
       FOR ALL USING (
         project_id IN (
           SELECT id FROM projects
           WHERE org_id = current_setting('rls.current_org_id')::uuid
         )
       )`,
    ],
  },
]
```

### Step 5: Create Repository (Data Access)

```typescript
// src/extensions/projects/repository.ts

import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import type { DbClient } from '@yobo/saas-core'
import { projects, projectMembers, projectTasks } from './schema'

export interface ProjectFilters {
  status?: string
  isArchived?: boolean
  ownerId?: string
  search?: string
  limit?: number
  offset?: number
}

export class ProjectRepository {
  constructor(private db: DbClient) {}

  async list(filters: ProjectFilters = {}) {
    const { status, isArchived, ownerId, search, limit = 50, offset = 0 } = filters

    let query = this.db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt))
      .limit(limit)
      .offset(offset)

    const conditions = []

    if (status) {
      conditions.push(eq(projects.status, status))
    }
    if (isArchived !== undefined) {
      conditions.push(eq(projects.isArchived, isArchived))
    }
    if (ownerId) {
      conditions.push(eq(projects.ownerId, ownerId))
    }
    if (search) {
      conditions.push(
        sql`${projects.name} ILIKE ${'%' + search + '%'}`
      )
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions))
    }

    return query
  }

  async getById(id: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1)

    return project || null
  }

  async create(data: {
    orgId: string
    ownerId: string
    name: string
    description?: string
    settings?: any
  }) {
    const [project] = await this.db
      .insert(projects)
      .values(data)
      .returning()

    return project
  }

  async update(id: string, data: Partial<typeof projects.$inferInsert>) {
    const [project] = await this.db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning()

    return project
  }

  async delete(id: string) {
    await this.db.delete(projects).where(eq(projects.id, id))
  }

  async archive(id: string) {
    return this.update(id, { isArchived: true })
  }

  async restore(id: string) {
    return this.update(id, { isArchived: false })
  }

  // Member operations
  async getMembers(projectId: string) {
    return this.db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId))
  }

  async addMember(projectId: string, userId: string, role: string = 'member') {
    const [member] = await this.db
      .insert(projectMembers)
      .values({ projectId, userId, role })
      .returning()

    return member
  }

  async removeMember(projectId: string, userId: string) {
    await this.db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        )
      )
  }

  // Task operations
  async getTasks(projectId: string) {
    return this.db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .orderBy(desc(projectTasks.createdAt))
  }

  async createTask(projectId: string, data: {
    title: string
    description?: string
    assigneeId?: string
    dueDate?: Date
  }) {
    const [task] = await this.db
      .insert(projectTasks)
      .values({ projectId, ...data })
      .returning()

    return task
  }

  async getStats(orgId: string) {
    const result = await this.db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE is_archived = true) as archived
      FROM projects
      WHERE org_id = ${orgId}
    `)

    return result.rows[0]
  }
}
```

### Step 6: Create Service (Business Logic)

```typescript
// src/extensions/projects/service.ts

import type { Actor } from '@yobo/saas-core'
import { ProjectRepository } from './repository'
import type { DbClient } from '@yobo/saas-core'

export class ProjectService {
  private repo: ProjectRepository

  constructor(private db: DbClient, private actor: Actor) {
    this.repo = new ProjectRepository(db)
  }

  async list(filters?: Parameters<ProjectRepository['list']>[0]) {
    return this.repo.list(filters)
  }

  async get(id: string) {
    const project = await this.repo.getById(id)

    if (!project) {
      throw new Error('Project not found')
    }

    return project
  }

  async create(data: { name: string; description?: string }) {
    return this.repo.create({
      orgId: this.actor.orgId,
      ownerId: this.actor.userId,
      name: data.name,
      description: data.description,
    })
  }

  async update(id: string, data: { name?: string; description?: string; status?: string }) {
    const project = await this.get(id)

    // Check ownership or admin permission
    if (project.ownerId !== this.actor.userId) {
      if (!this.actor.permissions.includes('project:update')) {
        throw new Error('Not authorized to update this project')
      }
    }

    return this.repo.update(id, data)
  }

  async delete(id: string) {
    const project = await this.get(id)

    // Only owners or admins can delete
    if (project.ownerId !== this.actor.userId) {
      if (!this.actor.permissions.includes('project:delete')) {
        throw new Error('Not authorized to delete this project')
      }
    }

    await this.repo.delete(id)
  }

  async archive(id: string) {
    const project = await this.get(id)

    if (project.ownerId !== this.actor.userId) {
      if (!this.actor.permissions.includes('project:archive')) {
        throw new Error('Not authorized to archive this project')
      }
    }

    return this.repo.archive(id)
  }

  // Member management
  async addMember(projectId: string, userId: string, role: string = 'member') {
    await this.get(projectId) // Verify project exists and user has access

    // Check if user can manage members
    if (!this.actor.permissions.includes('project:manage_members')) {
      throw new Error('Not authorized to manage project members')
    }

    return this.repo.addMember(projectId, userId, role)
  }

  async removeMember(projectId: string, userId: string) {
    await this.get(projectId)

    if (!this.actor.permissions.includes('project:manage_members')) {
      throw new Error('Not authorized to manage project members')
    }

    await this.repo.removeMember(projectId, userId)
  }

  // Task management
  async createTask(projectId: string, data: {
    title: string
    description?: string
    assigneeId?: string
    dueDate?: Date
  }) {
    await this.get(projectId)

    if (!this.actor.permissions.includes('project:manage_tasks')) {
      throw new Error('Not authorized to manage tasks')
    }

    return this.repo.createTask(projectId, data)
  }

  async getStats() {
    return this.repo.getStats(this.actor.orgId)
  }
}
```

### Step 7: Create Router (API Endpoints)

```typescript
// src/extensions/projects/router.ts

import { z } from 'zod'
import { createRouterWithActor, TRPCError } from '@yobo/saas-core/trpc'
import { ProjectService } from './service'

// Input validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
})

const updateProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
})

const listFiltersSchema = z.object({
  status: z.string().optional(),
  isArchived: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
}).optional()

const addMemberSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
})

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.coerce.date().optional(),
})

export const projectsRouter = createRouterWithActor({
  // List projects
  list: {
    type: 'query',
    permission: 'project:read',
    input: listFiltersSchema,
    cache: { ttl: 60, tags: ['projects'] },
    handler: async ({ input, ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      return service.list(input)
    },
  },

  // Get single project
  get: {
    type: 'query',
    permission: 'project:read',
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ input, ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      return service.get(input.id)
    },
  },

  // Create project
  create: {
    type: 'mutation',
    permission: 'project:create',
    input: createProjectSchema,
    handler: async ({ input, ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      return service.create(input)
    },
  },

  // Update project
  update: {
    type: 'mutation',
    permission: 'project:update',
    input: updateProjectSchema,
    handler: async ({ input, ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      const { id, ...data } = input
      return service.update(id, data)
    },
  },

  // Delete project
  delete: {
    type: 'mutation',
    permission: 'project:delete',
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ input, ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      await service.delete(input.id)
      return { success: true }
    },
  },

  // Archive project
  archive: {
    type: 'mutation',
    permission: 'project:archive',
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ input, ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      return service.archive(input.id)
    },
  },

  // Restore project
  restore: {
    type: 'mutation',
    permission: 'project:archive',
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ input, ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      return service.restore(input.id)
    },
  },

  // Get project stats
  stats: {
    type: 'query',
    permission: 'project:read',
    cache: { ttl: 300, tags: ['projects', 'stats'] },
    handler: async ({ ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      return service.getStats()
    },
  },

  // Member management
  addMember: {
    type: 'mutation',
    permission: 'project:manage_members',
    input: addMemberSchema,
    handler: async ({ input, ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      return service.addMember(input.projectId, input.userId, input.role)
    },
  },

  removeMember: {
    type: 'mutation',
    permission: 'project:manage_members',
    input: z.object({
      projectId: z.string().uuid(),
      userId: z.string().uuid(),
    }),
    handler: async ({ input, ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      await service.removeMember(input.projectId, input.userId)
      return { success: true }
    },
  },

  // Task management
  createTask: {
    type: 'mutation',
    permission: 'project:manage_tasks',
    input: createTaskSchema,
    handler: async ({ input, ctx }) => {
      const service = new ProjectService(ctx.db, ctx.actor)
      const { projectId, ...data } = input
      return service.createTask(projectId, data)
    },
  },
})

export type ProjectsRouter = typeof projectsRouter
```

### Step 8: Create UI Components

```typescript
// src/extensions/projects/components/ProjectList.tsx

'use client'

import { trpc } from '@/utils/trpc'
import { DataTable, Button, usePermissionCheck } from '@yobo/saas-core'
import { columns } from './columns'
import { CreateProjectDialog } from './CreateProjectDialog'

export function ProjectList() {
  const { data: projects, isLoading } = trpc.projects.list.useQuery()
  const canCreate = usePermissionCheck('project:create')

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Projects</h1>
        {canCreate && <CreateProjectDialog />}
      </div>

      <DataTable
        columns={columns}
        data={projects ?? []}
        isLoading={isLoading}
        searchPlaceholder="Search projects..."
      />
    </div>
  )
}
```

```typescript
// src/extensions/projects/components/CreateProjectDialog.tsx

'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/utils/trpc'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Button,
  Input,
  Textarea,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@yobo/saas-core'

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(1000).optional(),
})

type FormValues = z.infer<typeof formSchema>

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false)
  const utils = trpc.useUtils()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate()
      setOpen(false)
      form.reset()
    },
  })

  const onSubmit = (values: FormValues) => {
    createMutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Project name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Project description (optional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

```typescript
// src/extensions/projects/components/columns.tsx

'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Badge, Button, DropdownMenu } from '@yobo/saas-core'
import { MoreHorizontal, Archive, Trash2, Edit } from 'lucide-react'

type Project = {
  id: string
  name: string
  description: string | null
  status: string
  isArchived: boolean
  createdAt: Date
}

export const columns: ColumnDef<Project>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('name')}</div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      const variants: Record<string, 'default' | 'secondary' | 'success'> = {
        draft: 'secondary',
        active: 'default',
        completed: 'success',
      }
      return <Badge variant={variants[status] ?? 'default'}>{status}</Badge>
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => {
      const date = new Date(row.getValue('createdAt'))
      return date.toLocaleDateString()
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const project = row.original
      return (
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Item>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </DropdownMenu.Item>
            <DropdownMenu.Item>
              <Archive className="h-4 w-4 mr-2" /> Archive
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      )
    },
  },
]
```

### Step 9: Create Pages

```typescript
// src/app/(features)/projects/page.tsx

import { ProjectList } from '@/extensions/projects/components/ProjectList'

export default function ProjectsPage() {
  return (
    <div className="container py-6">
      <ProjectList />
    </div>
  )
}
```

```typescript
// src/app/(features)/projects/[id]/page.tsx

import { ProjectDetail } from '@/extensions/projects/components/ProjectDetail'

export default function ProjectDetailPage({
  params,
}: {
  params: { id: string }
}) {
  return (
    <div className="container py-6">
      <ProjectDetail projectId={params.id} />
    </div>
  )
}
```

### Step 10: Register Extension

Add your extension to the saas config:

```typescript
// saas.config.ts

import { defineSaasConfig } from '@yobo/saas-core'
import { projectsExtension } from './src/extensions/projects'

export default defineSaasConfig({
  // ... other config
  extensions: [
    projectsExtension,
  ],
})
```

### Step 11: Generate Migration & Deploy

> **IMPORTANT**: Extension migrations live in their own lane under `drizzle/extensions/<name>/`.
> The migration orchestrator runs core migrations first, then extension migrations.

```bash
# Generate migration for YOUR extension (creates in drizzle/extensions/projects/)
pnpm saas migrate:generate --extension projects

# Review the generated migration
cat drizzle/extensions/projects/0001_initial.sql

# Run all migrations (core first, then extensions, in order)
pnpm saas migrate

# Deploy RLS policies for all tables
pnpm saas rls:deploy

# Sync permissions to database
pnpm saas permissions:sync
```

### Extension Migration Directory Structure

```
apps/my-saas/
└── drizzle/
    └── extensions/
        └── projects/                    # Your extension's migrations
            ├── 0001_initial.sql         # First migration
            ├── 0002_add_status.sql      # Subsequent migrations
            └── meta/
                └── _journal.json        # Drizzle migration state
```

---

## RLS Context for Extensions

RLS context is handled **automatically** for tRPC procedures when you use `createRouterWithActor`. The middleware sets `rls.current_org_id` before your handler runs.

For REST endpoints or other non-tRPC code, manually wrap with `withRlsContext`:

```typescript
import { withRlsContext } from '@yobo/saas-core/rls'

export async function GET(req: Request) {
  const session = await getServerSession()

  return withRlsContext(db, session.user.orgId, session.user.id, async () => {
    // RLS is now active - queries will be filtered by org
    const projects = await db.select().from(projectsTable)
    return Response.json(projects)
  })
}
```

---

## Extension Best Practices

### 1. Isolation

Keep extensions self-contained:

```
GOOD: Extension imports from @yobo/saas-core
BAD:  Extension imports from another extension
```

If extensions need to communicate, use events:

```typescript
// Extension A emits event
import { events } from '@yobo/saas-core'
events.emit('project:created', project)

// Extension B listens
events.on('project:created', async (project) => {
  await createDefaultInvoice(project.id)
})
```

### 2. Permissions

Always check permissions in services:

```typescript
async delete(id: string) {
  if (!this.actor.permissions.includes('project:delete')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Missing permission: project:delete',
    })
  }
  // ... proceed with delete
}
```

### 3. RLS

Always include `org_id` on tables that need multi-tenant isolation:

```typescript
export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull().references(() => schema.orgs.id),
  // ... other columns
})
```

### 4. Type Safety

Export types from your extension:

```typescript
// src/extensions/projects/types.ts

import type { projects, projectTasks, projectMembers } from './schema'

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert

export type ProjectTask = typeof projectTasks.$inferSelect
export type ProjectMember = typeof projectMembers.$inferSelect
```

### 5. Testing

Write tests for critical paths:

```typescript
// src/extensions/projects/__tests__/service.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import { ProjectService } from '../service'
import { createTestDb, createTestActor } from '@yobo/saas-core/testing'

describe('ProjectService', () => {
  let db: TestDb
  let actor: Actor

  beforeEach(async () => {
    db = await createTestDb()
    actor = createTestActor({
      permissions: ['project:create', 'project:read'],
    })
  })

  it('creates a project', async () => {
    const service = new ProjectService(db, actor)
    const project = await service.create({
      name: 'Test Project',
      description: 'A test project',
    })

    expect(project.name).toBe('Test Project')
    expect(project.ownerId).toBe(actor.userId)
    expect(project.orgId).toBe(actor.orgId)
  })

  it('throws when creating without permission', async () => {
    const actorNoPerms = createTestActor({ permissions: [] })
    const service = new ProjectService(db, actorNoPerms)

    await expect(service.create({ name: 'Test' })).rejects.toThrow()
  })
})
```

---

## CLI Commands

The core provides CLI commands for extension management:

```bash
# Scaffold new extension
pnpm saas extension:create my-feature

# Validate extension
pnpm saas extension:validate src/extensions/my-feature

# List registered extensions
pnpm saas extension:list

# Sync extension permissions
pnpm saas permissions:sync

# Deploy extension RLS policies
pnpm saas rls:deploy
```

---

## Upgrading Extensions

When upgrading an extension:

1. Update version in `index.ts`
2. Create database migration if schema changed
3. Update permissions if needed
4. Test thoroughly
5. Deploy

```typescript
// index.ts
export const projectsExtension = defineExtension({
  name: 'projects',
  version: '1.1.0', // Bumped
  // ...
})
```

---

## Troubleshooting

### Permission not working

1. Check permission is defined in `permissions.ts`
2. Verify extension is registered in `saas.config.ts`
3. Run `pnpm saas permissions:sync`
4. Log out and log back in

### RLS blocking queries

1. Verify `org_id` column exists
2. Check RLS config in `rls.ts`
3. Run `pnpm saas rls:deploy`
4. Verify `rls.current_org_id` is set in context

### Router not found

1. Verify extension is in `saas.config.ts`
2. Check router is exported from `index.ts`
3. Restart dev server

### Type errors

1. Run `pnpm typecheck`
2. Ensure imports use `@yobo/saas-core` not relative paths
3. Regenerate types if schema changed

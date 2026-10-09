import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Email không hợp lệ'));
export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Nhập tên chủ nhà hàng').max(120),
    email,
    password: z.string().min(12, 'Mật khẩu tối thiểu 12 ký tự').max(128),
    restaurantName: z.string().trim().min(2, 'Nhập tên nhà hàng').max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Mã chỉ gồm chữ thường, số và dấu gạch nối'),
    timezone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('vi', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Múi giờ không hợp lệ')
      .default('Asia/Ho_Chi_Minh'),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;
export const registrationSettingsSchema = z.object({ registrationsEnabled: z.boolean() });
export const platformPrincipalSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.literal('PLATFORM_ADMIN'),
  expiresAt: z.iso.datetime(),
});
export type PlatformPrincipal = z.infer<typeof platformPrincipalSchema>;
export const tenantStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);
export const platformTenantQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    status: tenantStatusSchema.optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type PlatformTenantQuery = z.infer<typeof platformTenantQuerySchema>;
export const platformTenantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: tenantStatusSchema,
  suspensionReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  owners: z.array(z.object({ name: z.string(), email: z.email() })),
  counts: z.object({
    staff: z.number().int().nonnegative(),
    tables: z.number().int().nonnegative(),
    menuItems: z.number().int().nonnegative(),
  }),
});
export type PlatformTenant = z.infer<typeof platformTenantSchema>;
export const platformTenantListSchema = z.object({
  tenants: z.array(platformTenantSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const tenantStatusInputSchema = z
  .object({
    status: tenantStatusSchema,
    reason: z.string().trim().min(3).max(500),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
export type TenantStatusInput = z.infer<typeof tenantStatusInputSchema>;
export const platformSettingsSchema = registrationSettingsSchema.extend({
  updatedAt: z.iso.datetime(),
});
export const platformSettingsInputSchema = z
  .object({
    registrationsEnabled: z.boolean(),
    reason: z.string().trim().min(3).max(500),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
export type PlatformSettingsInput = z.infer<typeof platformSettingsInputSchema>;
export const platformOverviewSchema = z.object({
  generatedAt: z.iso.datetime(),
  uptimeSeconds: z.number().nonnegative(),
  database: z.literal('up'),
  counts: z.object({
    tenants: z.number().int().nonnegative(),
    activeTenants: z.number().int().nonnegative(),
    suspendedTenants: z.number().int().nonnegative(),
    users: z.number().int().nonnegative(),
    openSessions: z.number().int().nonnegative(),
  }),
  settings: platformSettingsSchema,
});
export const platformAuditQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const platformAuditSchema = z.object({
  entries: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      actor: z.object({ name: z.string(), email: z.email() }),
      targetId: z.string().nullable(),
      reason: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

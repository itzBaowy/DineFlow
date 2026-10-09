import { z } from 'zod';
export const roles = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;
export const roleLabels: Record<Role, string> = {
  OWNER: 'Chủ nhà hàng',
  MANAGER: 'Quản lý',
  CASHIER: 'Thu ngân',
  WAITER: 'Phục vụ',
  KITCHEN: 'Nhà bếp',
};
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email('Email không hợp lệ')),
    password: z.string().min(1, 'Nhập mật khẩu').max(128, 'Mật khẩu quá dài'),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;
export const staffPrincipalSchema = z.object({
  userId: z.uuid(),
  membershipId: z.uuid(),
  authSessionId: z.uuid(),
  restaurantId: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: roleSchema,
  restaurant: z.object({
    name: z.string(),
    currency: z.literal('VND'),
    timezone: z.string(),
    logoUrl: z.string().nullable(),
  }),
});
export type StaffPrincipal = z.infer<typeof staffPrincipalSchema>;

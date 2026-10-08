import { z } from 'zod';

export const roles = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;
export const roleLabels: Record<Role, string> = { OWNER: 'Chủ nhà hàng', MANAGER: 'Quản lý', CASHIER: 'Thu ngân', WAITER: 'Phục vụ', KITCHEN: 'Nhà bếp' };
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Email không hợp lệ')),
  password: z.string().min(1, 'Nhập mật khẩu').max(128, 'Mật khẩu quá dài'),
}).strict();
export type LoginInput = z.infer<typeof loginSchema>;
export const staffPrincipalSchema = z.object({
  userId: z.uuid(), membershipId: z.uuid(), authSessionId: z.uuid(), restaurantId: z.uuid(),
  email: z.email(), name: z.string(), role: roleSchema,
  restaurant: z.object({ name: z.string(), currency: z.literal('VND'), timezone: z.string(), logoUrl: z.string().nullable() }),
});
export type StaffPrincipal = z.infer<typeof staffPrincipalSchema>;
export const overviewSchema = z.object({
  restaurant: z.object({ id: z.uuid(), name: z.string(), currency: z.literal('VND'), timezone: z.string() }),
  counts: z.object({ tables: z.number().int().nonnegative(), categories: z.number().int().nonnegative(), menuItems: z.number().int().nonnegative(), availableMenuItems: z.number().int().nonnegative(), staff: z.number().int().nonnegative() }),
});
export type RestaurantOverview = z.infer<typeof overviewSchema>;

export const orderStatuses = ['PENDING_CONFIRMATION', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'] as const;
export type OrderStatus = typeof orderStatuses[number];
const orderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_CONFIRMATION: ['ACCEPTED', 'CANCELLED'], ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'], READY: ['SERVED'], SERVED: [], CANCELLED: [],
};
export function canTransitionOrder(from: OrderStatus, to: OrderStatus, role: Role): boolean {
  if (!orderTransitions[from].includes(to)) return false;
  if (role === 'OWNER' || role === 'MANAGER') return true;
  if (to === 'CANCELLED') return from === 'PENDING_CONFIRMATION' && role === 'WAITER';
  if (to === 'ACCEPTED' || to === 'SERVED') return role === 'WAITER';
  return role === 'KITCHEN';
}
export type DiningSessionStatus = 'OPEN' | 'PAYMENT_REQUESTED' | 'CLOSED';
export function canTransitionDiningSession(from: DiningSessionStatus, to: DiningSessionStatus): boolean {
  return (from === 'OPEN' && (to === 'PAYMENT_REQUESTED' || to === 'CLOSED')) || (from === 'PAYMENT_REQUESTED' && (to === 'OPEN' || to === 'CLOSED'));
}
export function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
}

import { z } from 'zod';
import { loginSchema, roleSchema, staffPrincipalSchema } from './identity';
import { registerSchema, tenantStatusSchema } from './saas';

export const staffLoginSchema = loginSchema.extend({ restaurantId: z.uuid().optional() });
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export const restaurantChoiceSchema = z.object({
  restaurantId: z.uuid(),
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  role: roleSchema,
  status: tenantStatusSchema,
});
export type RestaurantChoice = z.infer<typeof restaurantChoiceSchema>;
export const restaurantChoicesSchema = z.object({
  restaurants: z.array(restaurantChoiceSchema),
});
export const staffLoginResultSchema = z.union([
  staffPrincipalSchema,
  restaurantChoicesSchema.extend({ selectionRequired: z.literal(true) }),
]);
export const createRestaurantSchema = registerSchema.pick({
  restaurantName: true,
  slug: true,
  timezone: true,
});
export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export const switchRestaurantSchema = z.object({ restaurantId: z.uuid() }).strict();

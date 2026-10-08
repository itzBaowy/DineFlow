import { z } from 'zod';

const name = z.string().trim().min(1, 'Nhập tên').max(120, 'Tên tối đa 120 ký tự');
const description = z.string().trim().max(2000).nullable();
const position = z.number().int().min(0).max(10000);
const money = z.number().int().min(0, 'Giá không được âm').max(100000000, 'Giá vượt giới hạn');
export const imageUrlSchema = z
  .string()
  .regex(/^\/api\/v1\/storage\/images\/[0-9a-f-]{36}$/)
  .refine((value) => z.uuid().safeParse(value.split('/').at(-1)).success, 'Mã ảnh không hợp lệ')
  .nullable();
export const restaurantInputSchema = z
  .object({
    name,
    address: z.string().trim().max(500).nullable(),
    phone: z.string().trim().max(30).nullable(),
    logoUrl: imageUrlSchema,
    timezone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('vi-VN', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Múi giờ không hợp lệ'),
    serviceChargeBps: z.number().int().min(0).max(10000),
    taxBps: z.number().int().min(0).max(10000),
  })
  .strict();
export const restaurantSettingsSchema = restaurantInputSchema
  .extend({ id: z.uuid(), currency: z.literal('VND') })
  .strip();
export const categoryInputSchema = z
  .object({ name, description, position, isActive: z.boolean() })
  .strict();
export const categorySchema = categoryInputSchema.extend({ id: z.uuid() }).strip();
export const modifierOptionInputSchema = z
  .object({ id: z.uuid().optional(), name, priceDelta: money, isAvailable: z.boolean(), position })
  .strict();
export const modifierInputSchema = z
  .object({
    name,
    minSelections: z.number().int().min(0).max(30),
    maxSelections: z.number().int().min(1).max(30),
    position,
    options: z.array(modifierOptionInputSchema).min(1).max(30),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.minSelections > data.maxSelections ||
      data.minSelections > data.options.filter((option) => option.isAvailable).length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['minSelections'],
        message: 'Số lựa chọn tối thiểu phải ≤ tối đa và số tùy chọn đang bán',
      });
    const ids = data.options.flatMap((option) => (option.id ? [option.id] : []));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Tùy chọn bị trùng' });
  });
export const modifierSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  minSelections: z.number().int(),
  maxSelections: z.number().int(),
  position: z.number().int(),
  options: z.array(modifierOptionInputSchema.extend({ id: z.uuid() })),
});
export const menuInputSchema = z
  .object({
    name,
    description,
    categoryId: z.uuid('Chọn danh mục'),
    imageUrl: imageUrlSchema,
    basePrice: money,
    isAvailable: z.boolean(),
    position,
    modifierGroupIds: z
      .array(z.uuid())
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, 'Nhóm tùy chọn bị trùng'),
  })
  .strict();
export const menuSchema = menuInputSchema
  .extend({ id: z.uuid(), categoryName: z.string(), categoryActive: z.boolean() })
  .strip();
export const tableInputSchema = z
  .object({
    name,
    capacity: z.number().int().min(1).max(100),
    position,
    status: z.enum(['AVAILABLE', 'OUT_OF_SERVICE']),
  })
  .strict();
export const tableSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  capacity: z.number().int(),
  position: z.number().int(),
  status: z.enum(['AVAILABLE', 'OUT_OF_SERVICE', 'OCCUPIED', 'NEEDS_CLEANING']),
  publicCode: z.string(),
  url: z.url(),
});
export const tableContextSchema = z.object({
  restaurant: z.object({
    name: z.string(),
    logoUrl: imageUrlSchema,
    address: z.string().nullable(),
  }),
  table: z.object({ name: z.string() }),
  orderingEnabled: z.boolean(),
});
export const uploadSchema = z.object({ id: z.uuid(), imageUrl: imageUrlSchema.unwrap() });
export type RestaurantInput = z.infer<typeof restaurantInputSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ModifierInput = z.infer<typeof modifierInputSchema>;
export type MenuInput = z.infer<typeof menuInputSchema>;
export type TableInput = z.infer<typeof tableInputSchema>;
export type Menu = z.infer<typeof menuSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Modifier = z.infer<typeof modifierSchema>;
export type DiningTable = z.infer<typeof tableSchema>;

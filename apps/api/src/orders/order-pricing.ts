import { BadRequestException, ConflictException } from '@nestjs/common';
import type { CreateOrderInput } from '@dineflow/shared';
import type { Prisma } from '../generated/prisma/client';

export async function priceOrder(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  input: CreateOrderInput,
) {
  const items: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
  let totalAmount = 0;
  for (const line of input.items) {
    const item = await tx.menuItem.findFirst({
      where: {
        id: line.menuItemId,
        restaurantId: restaurantId,
        archivedAt: null,
        isAvailable: true,
        category: { isActive: true, archivedAt: null },
      },
      include: {
        modifierGroups: {
          include: { modifierGroup: { include: { options: { where: { archivedAt: null } } } } },
        },
      },
    });
    if (!item)
      throw new BadRequestException('Món đã hết hoặc ngừng bán. Vui lòng cập nhật giỏ hàng');
    const modifiers: Prisma.OrderItemModifierUncheckedCreateWithoutOrderItemInput[] = [];
    const selected = new Set(line.modifierOptionIds);
    let unitPrice = item.basePrice;
    for (const link of item.modifierGroups) {
      const group = link.modifierGroup;
      if (group.archivedAt) throw new BadRequestException('Tùy chọn món đã ngừng bán');
      const options = group.options.filter((option) => selected.has(option.id));
      if (options.length < group.minSelections || options.length > group.maxSelections)
        throw new BadRequestException(
          `${item.name}: ${group.name} cần chọn từ ${group.minSelections} đến ${group.maxSelections} lựa chọn`,
        );
      for (const option of options) {
        if (!option.isAvailable)
          throw new BadRequestException(`${option.name} đã hết. Vui lòng chọn lại`);
        selected.delete(option.id);
        unitPrice += option.priceDelta;
        modifiers.push({
          modifierOptionId: option.id,
          groupNameSnapshot: group.name,
          optionNameSnapshot: option.name,
          priceDeltaSnapshot: option.priceDelta,
        });
      }
    }
    if (selected.size) throw new BadRequestException('Tùy chọn không thuộc món hoặc đã ngừng bán');
    const lineTotal = unitPrice * line.quantity;
    totalAmount += lineTotal;
    if (totalAmount > 2147483647 || unitPrice > 2147483647)
      throw new BadRequestException('Tổng giá trị đơn vượt giới hạn cho phép');
    items.push({
      menuItemId: item.id,
      nameSnapshot: item.name,
      basePriceSnapshot: item.basePrice,
      unitPrice,
      quantity: line.quantity,
      totalAmount: lineTotal,
      note: line.note || null,
      modifiers: { create: modifiers },
    });
  }
  if (input.expectedTotal !== totalAmount)
    throw new ConflictException(
      'Giá món đã thay đổi. Vui lòng tải lại thực đơn và kiểm tra tổng tiền trước khi gửi',
    );
  return { items, totalAmount };
}

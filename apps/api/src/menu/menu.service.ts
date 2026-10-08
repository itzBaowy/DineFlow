import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CategoryInput, MenuInput, ModifierInput, StaffPrincipal } from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { SetupMutationService } from '../common/setup-mutation.service';

@Injectable()
export class MenuService {
  constructor(
    private readonly db: PrismaService,
    private readonly mutations: SetupMutationService,
  ) {}
  categories(restaurantId: string) {
    return this.db.menuCategory.findMany({
      where: { restaurantId, archivedAt: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }
  modifiers(restaurantId: string) {
    return this.db.modifierGroup.findMany({
      where: { restaurantId, archivedAt: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        minSelections: true,
        maxSelections: true,
        position: true,
        options: {
          where: { archivedAt: null },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, priceDelta: true, isAvailable: true, position: true },
        },
      },
    });
  }
  async items(restaurantId: string) {
    const rows = await this.db.menuItem.findMany({
      where: { restaurantId, archivedAt: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { category: true, modifierGroups: { orderBy: { position: 'asc' } } },
    });
    return rows.map(({ category, modifierGroups, ...item }) => ({
      ...item,
      categoryName: category.name,
      categoryActive: category.isActive && !category.archivedAt,
      modifierGroupIds: modifierGroups.map((link) => link.modifierGroupId),
    }));
  }
  saveCategory(staff: StaffPrincipal, input: CategoryInput, id?: string) {
    return this.mutations.run(
      staff,
      id ? 'category.updated' : 'category.created',
      'MenuCategory',
      async (tx) => {
        if (
          id &&
          !(await tx.menuCategory.findFirst({
            where: { id, restaurantId: staff.restaurantId, archivedAt: null },
          }))
        )
          throw new NotFoundException('Không tìm thấy danh mục');
        return id
          ? tx.menuCategory.update({ where: { id }, data: input })
          : tx.menuCategory.create({ data: { ...input, restaurantId: staff.restaurantId } });
      },
    );
  }
  archiveCategory(staff: StaffPrincipal, id: string) {
    return this.mutations.run(staff, 'category.archived', 'MenuCategory', async (tx) => {
      if (
        !(await tx.menuCategory.findFirst({
          where: { id, restaurantId: staff.restaurantId, archivedAt: null },
        }))
      )
        throw new NotFoundException('Không tìm thấy danh mục');
      if (await tx.menuItem.count({ where: { categoryId: id, archivedAt: null } }))
        throw new ConflictException('Chuyển hoặc lưu trữ các món trong danh mục trước');
      return tx.menuCategory.update({
        where: { id },
        data: { archivedAt: new Date(), isActive: false },
      });
    });
  }
  saveItem(staff: StaffPrincipal, input: MenuInput, id?: string) {
    return this.mutations.run(
      staff,
      id ? 'menu.updated' : 'menu.created',
      'MenuItem',
      async (tx) => {
        const restaurantId = staff.restaurantId;
        if (id && !(await tx.menuItem.findFirst({ where: { id, restaurantId, archivedAt: null } })))
          throw new NotFoundException('Không tìm thấy món');
        if (
          !(await tx.menuCategory.findFirst({
            where: { id: input.categoryId, restaurantId, archivedAt: null },
          }))
        )
          throw new BadRequestException('Danh mục không thuộc nhà hàng hoặc đã lưu trữ');
        const groups = await tx.modifierGroup.findMany({
          where: { id: { in: input.modifierGroupIds }, restaurantId, archivedAt: null },
          include: { options: { where: { isAvailable: true, archivedAt: null } } },
        });
        if (
          groups.length !== input.modifierGroupIds.length ||
          groups.some((group) => group.options.length < group.minSelections)
        )
          throw new BadRequestException('Nhóm size/topping không hợp lệ');
        await this.mutations.image(tx, restaurantId, input.imageUrl);
        const { modifierGroupIds, ...data } = input;
        const item = id
          ? await tx.menuItem.update({ where: { id }, data })
          : await tx.menuItem.create({ data: { ...data, restaurantId } });
        await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: item.id } });
        if (modifierGroupIds.length)
          await tx.menuItemModifierGroup.createMany({
            data: modifierGroupIds.map((modifierGroupId, position) => ({
              menuItemId: item.id,
              modifierGroupId,
              restaurantId,
              position,
            })),
          });
        return item;
      },
    );
  }
  archiveItem(staff: StaffPrincipal, id: string) {
    return this.mutations.run(staff, 'menu.archived', 'MenuItem', async (tx) => {
      if (
        !(await tx.menuItem.findFirst({
          where: { id, restaurantId: staff.restaurantId, archivedAt: null },
        }))
      )
        throw new NotFoundException('Không tìm thấy món');
      return tx.menuItem.update({
        where: { id },
        data: { archivedAt: new Date(), isAvailable: false },
      });
    });
  }
  saveModifier(staff: StaffPrincipal, input: ModifierInput, id?: string) {
    return this.mutations.run(
      staff,
      id ? 'modifier.updated' : 'modifier.created',
      'ModifierGroup',
      async (tx) => {
        const restaurantId = staff.restaurantId;
        if (
          id &&
          !(await tx.modifierGroup.findFirst({ where: { id, restaurantId, archivedAt: null } }))
        )
          throw new NotFoundException('Không tìm thấy nhóm tùy chọn');
        const { options, ...data } = input;
        const oldOptions = id
          ? await tx.modifierOption.findMany({ where: { modifierGroupId: id, archivedAt: null } })
          : [];
        if (options.some((option) => option.id && !oldOptions.some((old) => old.id === option.id)))
          throw new BadRequestException('Tùy chọn không thuộc nhóm');
        const group = id
          ? await tx.modifierGroup.update({ where: { id }, data })
          : await tx.modifierGroup.create({ data: { ...data, restaurantId } });
        const keep = options.flatMap((option) => (option.id ? [option.id] : []));
        await tx.modifierOption.updateMany({
          where: { modifierGroupId: group.id, archivedAt: null, id: { notIn: keep } },
          data: { archivedAt: new Date(), isAvailable: false },
        });
        for (const option of options) {
          const { id: optionId, ...optionData } = option;
          if (optionId)
            await tx.modifierOption.update({ where: { id: optionId }, data: optionData });
          else
            await tx.modifierOption.create({
              data: { ...optionData, restaurantId, modifierGroupId: group.id },
            });
        }
        return group;
      },
    );
  }
  archiveModifier(staff: StaffPrincipal, id: string) {
    return this.mutations.run(staff, 'modifier.archived', 'ModifierGroup', async (tx) => {
      if (
        !(await tx.modifierGroup.findFirst({
          where: { id, restaurantId: staff.restaurantId, archivedAt: null },
        }))
      )
        throw new NotFoundException('Không tìm thấy nhóm');
      if (
        await tx.menuItemModifierGroup.count({
          where: { modifierGroupId: id, menuItem: { archivedAt: null } },
        })
      )
        throw new ConflictException('Gỡ nhóm tùy chọn khỏi các món trước');
      return tx.modifierGroup.update({ where: { id }, data: { archivedAt: new Date() } });
    });
  }
}

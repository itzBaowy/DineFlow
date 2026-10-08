import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RestaurantOverview, StaffPrincipal } from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { CurrentStaff } from '../auth/current-staff';
import { Roles } from '../auth/policies';
import { restaurantInputSchema, type RestaurantInput } from '@dineflow/shared';
import { ZodPipe } from '../common/zod.pipe';
import { SetupMutationService } from '../common/setup-mutation.service';

@ApiTags('Restaurant')
@ApiCookieAuth('df_access')
@Controller('restaurant')
export class RestaurantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mutations: SetupMutationService,
  ) {}
  @Get('overview')
  @ApiOperation({ summary: 'Số lượng cấu hình trong restaurant của membership hiện tại' })
  async overview(@CurrentStaff() staff: StaffPrincipal): Promise<RestaurantOverview> {
    const restaurantId = staff.restaurantId;
    const [restaurant, tables, categories, menuItems, availableMenuItems, members] =
      await this.prisma.$transaction([
        this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }),
        this.prisma.diningTable.count({ where: { restaurantId, archivedAt: null } }),
        this.prisma.menuCategory.count({
          where: { restaurantId, archivedAt: null, isActive: true },
        }),
        this.prisma.menuItem.count({ where: { restaurantId, archivedAt: null } }),
        this.prisma.menuItem.count({
          where: {
            restaurantId,
            archivedAt: null,
            isAvailable: true,
            category: { isActive: true, archivedAt: null },
          },
        }),
        this.prisma.staffMembership.count({
          where: { restaurantId, isActive: true, user: { isActive: true } },
        }),
      ]);
    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        currency: 'VND',
        timezone: restaurant.timezone,
      },
      counts: { tables, categories, menuItems, availableMenuItems, staff: members },
    };
  }
  @Get('settings')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Thiết lập hiện tại, chỉ owner/manager' })
  async settings(@CurrentStaff() staff: StaffPrincipal) {
    return this.prisma.restaurant.findUniqueOrThrow({
      where: { id: staff.restaurantId },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        logoUrl: true,
        currency: true,
        timezone: true,
        serviceChargeBps: true,
        taxBps: true,
        cashierMaxDiscountBps: true,
      },
    });
  }
  @Patch('settings')
  @Roles('OWNER', 'MANAGER')
  update(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodPipe(restaurantInputSchema)) input: RestaurantInput,
  ) {
    return this.mutations.run(staff, 'restaurant.updated', 'Restaurant', async (tx) => {
      await this.mutations.image(tx, staff.restaurantId, input.logoUrl);
      return tx.restaurant.update({ where: { id: staff.restaurantId }, data: input });
    });
  }
}

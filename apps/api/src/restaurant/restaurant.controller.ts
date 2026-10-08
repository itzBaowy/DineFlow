import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RestaurantOverview, StaffPrincipal } from '@dineflow/shared';
import { PrismaService } from '../database/prisma.service';
import { CurrentStaff } from '../auth/current-staff';
import { Roles } from '../auth/policies';

@ApiTags('Restaurant')
@ApiCookieAuth('df_access')
@Controller('restaurant')
export class RestaurantController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('overview')
  @ApiOperation({ summary: 'Số lượng cấu hình trong restaurant của membership hiện tại' })
  async overview(@CurrentStaff() staff: StaffPrincipal): Promise<RestaurantOverview> {
    const restaurantId = staff.restaurantId;
    const [restaurant, tables, categories, menuItems, availableMenuItems, members] = await this.prisma.$transaction([
      this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }),
      this.prisma.diningTable.count({ where: { restaurantId, archivedAt: null } }),
      this.prisma.menuCategory.count({ where: { restaurantId, archivedAt: null, isActive: true } }),
      this.prisma.menuItem.count({ where: { restaurantId, archivedAt: null } }),
      this.prisma.menuItem.count({ where: { restaurantId, archivedAt: null, isAvailable: true, category: { isActive: true, archivedAt: null } } }),
      this.prisma.staffMembership.count({ where: { restaurantId, isActive: true, user: { isActive: true } } }),
    ]);
    return { restaurant: { id: restaurant.id, name: restaurant.name, currency: 'VND', timezone: restaurant.timezone }, counts: { tables, categories, menuItems, availableMenuItems, staff: members } };
  }
  @Get('settings')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Thiết lập hiện tại, chỉ owner/manager; mutation ở Phase 2' })
  async settings(@CurrentStaff() staff: StaffPrincipal) {
    return this.prisma.restaurant.findUniqueOrThrow({ where: { id: staff.restaurantId }, select: { id: true, name: true, address: true, phone: true, currency: true, timezone: true, serviceChargeBps: true, taxBps: true } });
  }
}

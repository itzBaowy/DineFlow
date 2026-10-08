import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  categoryInputSchema,
  menuInputSchema,
  modifierInputSchema,
  type CategoryInput,
  type MenuInput,
  type ModifierInput,
  type StaffPrincipal,
} from '@dineflow/shared';
import { CurrentStaff } from '../auth/current-staff';
import { Roles } from '../auth/policies';
import { ZodPipe } from '../common/zod.pipe';
import { MenuService } from './menu.service';

@ApiTags('Menu setup')
@ApiCookieAuth('df_access')
@Roles('OWNER', 'MANAGER')
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}
  @Get('categories') categories(@CurrentStaff() staff: StaffPrincipal) {
    return this.menu.categories(staff.restaurantId);
  }
  @Post('categories') createCategory(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodPipe(categoryInputSchema)) body: CategoryInput,
  ) {
    return this.menu.saveCategory(staff, body);
  }
  @Patch('categories/:id') updateCategory(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(categoryInputSchema)) body: CategoryInput,
  ) {
    return this.menu.saveCategory(staff, body, id);
  }
  @Delete('categories/:id') archiveCategory(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.menu.archiveCategory(staff, id);
  }
  @Get('items') items(@CurrentStaff() staff: StaffPrincipal) {
    return this.menu.items(staff.restaurantId);
  }
  @Post('items') createItem(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodPipe(menuInputSchema)) body: MenuInput,
  ) {
    return this.menu.saveItem(staff, body);
  }
  @Patch('items/:id') updateItem(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(menuInputSchema)) body: MenuInput,
  ) {
    return this.menu.saveItem(staff, body, id);
  }
  @Delete('items/:id') archiveItem(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.menu.archiveItem(staff, id);
  }
  @Get('modifiers') modifiers(@CurrentStaff() staff: StaffPrincipal) {
    return this.menu.modifiers(staff.restaurantId);
  }
  @Post('modifiers') createModifier(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodPipe(modifierInputSchema)) body: ModifierInput,
  ) {
    return this.menu.saveModifier(staff, body);
  }
  @Patch('modifiers/:id') updateModifier(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(modifierInputSchema)) body: ModifierInput,
  ) {
    return this.menu.saveModifier(staff, body, id);
  }
  @Delete('modifiers/:id') archiveModifier(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.menu.archiveModifier(staff, id);
  }
}

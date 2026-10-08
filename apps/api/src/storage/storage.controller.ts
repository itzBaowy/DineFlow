import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {} from 'multer';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { StaffPrincipal } from '@dineflow/shared';
import { CurrentStaff } from '../auth/current-staff';
import { MultipartUpload, Public, Roles } from '../auth/policies';
import { StorageService } from './storage.service';

@ApiTags('Storage')
@Controller('storage/images')
export class StorageController {
  constructor(private readonly storage: StorageService) {}
  @Post()
  @ApiCookieAuth('df_access')
  @Roles('OWNER', 'MANAGER')
  @MultipartUpload()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    }),
  )
  upload(@CurrentStaff() staff: StaffPrincipal, @UploadedFile() file?: Express.Multer.File) {
    return this.storage.upload(staff, file);
  }
  @Public()
  @Get(':id')
  async image(@Param('id', new ParseUUIDPipe()) id: string, @Res() response: Response) {
    const image = await this.storage.image(id);
    response.type('webp').setHeader('Cache-Control', 'public, max-age=86400, immutable');
    response.send(image);
  }
}

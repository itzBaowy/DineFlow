import { SetMetadata } from '@nestjs/common';
import type { Role } from '@dineflow/shared';

export const IS_PUBLIC = 'dineflow:public';
export const ALLOWED_ROLES = 'dineflow:roles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: Role[]) => SetMetadata(ALLOWED_ROLES, roles);
export const ALLOW_MULTIPART = 'dineflow:multipart';
export const MultipartUpload = () => SetMetadata(ALLOW_MULTIPART, true);

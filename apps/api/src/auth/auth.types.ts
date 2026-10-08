import type { StaffPrincipal } from '@dineflow/shared';
import type { Request } from 'express';

export interface StaffRequest extends Request { staff?: StaffPrincipal }
export interface AccessClaims { sub: string; sid: string; type: 'staff_access' }

'use client';
import { useQuery } from '@tanstack/react-query';
import { staffPrincipalSchema } from '@dineflow/shared';
import { api } from '@/lib/api';
export const staffQueryKey = ['auth', 'me'] as const;
export function useStaff() { return useQuery({ queryKey: staffQueryKey, queryFn: ({ signal }) => api('/auth/me', staffPrincipalSchema, { signal }) }); }

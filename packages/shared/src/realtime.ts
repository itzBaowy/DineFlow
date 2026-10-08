import { z } from 'zod';

export const realtimePath = '/api/v1/realtime/socket.io';
export const realtimeTicketSchema = z.object({
  ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.iso.datetime(),
});
export const realtimeEventNames = [
  'order.created',
  'billing.updated',
  'payment.completed',
  'order.accepted',
  'order.status_changed',
  'table.status_changed',
  'dining_session.closed',
  'service_request.created',
  'service_request.updated',
] as const;
export const realtimeEventSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(realtimeEventNames),
    occurredAt: z.iso.datetime(),
    orderId: z.uuid().optional(),
    diningSessionId: z.uuid().optional(),
    tableId: z.uuid().optional(),
  })
  .strict();
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export const serviceRequestTypes = ['CALL_STAFF', 'REQUEST_PAYMENT'] as const;
export const serviceRequestStatuses = ['PENDING', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export const serviceRequestInputSchema = z
  .object({ diningSessionId: z.uuid(), type: z.enum(serviceRequestTypes) })
  .strict();
export type ServiceRequestInput = z.infer<typeof serviceRequestInputSchema>;
export const serviceRequestTransitionSchema = z
  .object({ from: z.enum(serviceRequestStatuses), to: z.enum(['ACKNOWLEDGED', 'RESOLVED']) })
  .strict();
export type ServiceRequestTransition = z.infer<typeof serviceRequestTransitionSchema>;
export const serviceRequestSchema = z.object({
  id: z.uuid(),
  diningSessionId: z.uuid(),
  type: z.enum(serviceRequestTypes),
  status: z.enum(serviceRequestStatuses),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;
export const serviceRequestListQuerySchema = z
  .object({
    status: z.enum(serviceRequestStatuses).default('PENDING'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();
export type ServiceRequestListQuery = z.infer<typeof serviceRequestListQuerySchema>;
export const serviceRequestPageSchema = z.object({
  requests: z.array(
    serviceRequestSchema.extend({ table: z.object({ id: z.uuid(), name: z.string() }) }),
  ),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

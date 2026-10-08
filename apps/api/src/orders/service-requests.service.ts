import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ServiceRequestInput,
  ServiceRequestTransition,
  ServiceRequestListQuery,
  StaffPrincipal,
} from '@dineflow/shared';
import type { ServiceRequest as StoredRequest } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrdersService } from './orders.service';
import { lockSession, lockTable } from '../dining-sessions/dining-sessions.service';
import { RealtimeService } from '../realtime/realtime.service';

export function serviceRequestDto(request: StoredRequest) {
  return {
    id: request.id,
    diningSessionId: request.diningSessionId,
    type: request.type,
    status: request.status,
    createdAt: request.createdAt,
    resolvedAt: request.resolvedAt,
  };
}
@Injectable()
export class ServiceRequestsService {
  constructor(
    private readonly db: PrismaService,
    private readonly orders: OrdersService,
    private readonly realtime: RealtimeService,
  ) {}
  guestList(code: string, token?: string) {
    return this.orders.withGuest(code, token, async (tx, { session }) => {
      // Shared table requests contain no guest identity; no historic-session access.
      const active = await tx.serviceRequest.findMany({
        where: { diningSessionId: session.id, status: { in: ['PENDING', 'ACKNOWLEDGED'] } },
        orderBy: { createdAt: 'desc' },
        take: 2,
      });
      const recent = await tx.serviceRequest.findMany({
        where: { diningSessionId: session.id, status: 'RESOLVED' },
        orderBy: { createdAt: 'desc' },
        take: 18,
      });
      return [...active, ...recent].map(serviceRequestDto);
    });
  }
  async create(code: string, input: ServiceRequestInput, token?: string) {
    const result = await this.orders.withGuest(
      code,
      token,
      async (tx, { table, session, guest }) => {
        if (input.diningSessionId !== session.id)
          throw new ConflictException('Phiên bàn đã thay đổi');
        const existing = await tx.serviceRequest.findFirst({
          where: {
            diningSessionId: session.id,
            type: input.type,
            status: { in: ['PENDING', 'ACKNOWLEDGED'] },
          },
        });
        if (existing)
          return {
            request: serviceRequestDto(existing),
            created: false,
            table,
            paymentRequested: false,
          };
        // Cooldown includes resolved requests so guests cannot continually summon staff.
        if (
          await tx.serviceRequest.count({
            where: {
              diningSessionId: session.id,
              type: input.type,
              createdAt: { gt: new Date(Date.now() - 30000) },
            },
          })
        )
          throw new ConflictException('Vui lòng chờ 30 giây trước khi gửi lại cùng yêu cầu');
        const request = await tx.serviceRequest.create({
          data: {
            restaurantId: table.restaurantId,
            diningSessionId: session.id,
            guestSessionId: guest.id,
            type: input.type,
          },
        });
        const paymentRequested = input.type === 'REQUEST_PAYMENT' && session.status === 'OPEN';
        if (paymentRequested)
          await tx.diningSession.update({
            where: { id: session.id },
            data: { status: 'PAYMENT_REQUESTED', paymentRequestedAt: new Date() },
          });
        await tx.activityLog.create({
          data: {
            restaurantId: table.restaurantId,
            action: 'service_request.created',
            entityType: 'ServiceRequest',
            entityId: request.id,
            metadata: { diningSessionId: session.id, type: input.type, paymentRequested },
          },
        });
        return { request: serviceRequestDto(request), created: true, table, paymentRequested };
      },
    );
    const scope = {
      restaurantId: result.table.restaurantId,
      tableId: result.table.id,
      diningSessionId: result.request.diningSessionId,
    };
    if (result.created) await this.realtime.publish('service_request.created', scope);
    if (result.paymentRequested) await this.realtime.publish('table.status_changed', scope);
    return result.request;
  }
  list(restaurantId: string, query: ServiceRequestListQuery) {
    return this.db.$transaction(
      async (tx) => {
        const where = {
          restaurantId,
          status: query.status,
          diningSession: {
            status: { in: ['OPEN', 'PAYMENT_REQUESTED'] as ('OPEN' | 'PAYMENT_REQUESTED')[] },
          },
        };
        const total = await tx.serviceRequest.count({ where });
        const requests = await tx.serviceRequest.findMany({
          where,
          include: { diningSession: { select: { table: { select: { id: true, name: true } } } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        return {
          requests: requests.map((request) => ({
            ...serviceRequestDto(request),
            table: request.diningSession.table,
          })),
          total,
          page: query.page,
          pageSize: query.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async transition(staff: StaffPrincipal, id: string, input: ServiceRequestTransition) {
    const context = await this.db.serviceRequest.findFirst({
      where: { id, restaurantId: staff.restaurantId },
      include: { diningSession: { select: { tableId: true } } },
    });
    if (!context) throw new NotFoundException('Không tìm thấy yêu cầu');
    if (staff.role === 'CASHIER' && context.type !== 'REQUEST_PAYMENT')
      throw new ForbiddenException('Thu ngân chỉ xử lý yêu cầu thanh toán');
    const result = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${staff.restaurantId}::uuid FOR UPDATE`;
        const table = await lockTable(tx, staff.restaurantId, context.diningSession.tableId),
          session = await lockSession(tx, table.id);
        if (!session || session.id !== context.diningSessionId || table.status !== 'OCCUPIED')
          throw new ConflictException('Phiên bàn đã ngừng phục vụ');
        await tx.$queryRaw`SELECT id FROM "ServiceRequest" WHERE id = ${id}::uuid FOR UPDATE`;
        const current = await tx.serviceRequest.findUniqueOrThrow({ where: { id } });
        if (current.status !== input.from)
          throw new ConflictException('Yêu cầu đã được người khác cập nhật. Vui lòng tải lại');
        if (
          !(
            (input.from === 'PENDING' && input.to === 'ACKNOWLEDGED') ||
            (input.from === 'ACKNOWLEDGED' && input.to === 'RESOLVED')
          )
        )
          throw new ConflictException(
            'Cần tiếp nhận trước khi hoàn tất; không mở lại yêu cầu đã xử lý',
          );
        const updated = await tx.serviceRequest.update({
          where: { id },
          data: { status: input.to, resolvedAt: input.to === 'RESOLVED' ? new Date() : null },
        });
        await tx.activityLog.create({
          data: {
            restaurantId: staff.restaurantId,
            actorUserId: staff.userId,
            action: `service_request.${input.to.toLowerCase()}`,
            entityType: 'ServiceRequest',
            entityId: id,
            metadata: { from: input.from, to: input.to },
          },
        });
        return serviceRequestDto(updated);
      },
      { maxWait: 10000, timeout: 15000 },
    );
    await this.realtime.publish('service_request.updated', {
      restaurantId: staff.restaurantId,
      tableId: context.diningSession.tableId,
      diningSessionId: context.diningSessionId,
    });
    return result;
  }
}

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { RealtimeEvent, StaffPrincipal } from '@dineflow/shared';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';

type StaffIdentity = { kind: 'staff'; token: string; staff: StaffPrincipal };
export type GuestIdentity = {
  kind: 'guest';
  guestId: string;
  diningSessionId: string;
  tableId: string;
  restaurantId: string;
  code: string;
};
type Identity = StaffIdentity | GuestIdentity;
export type EventScope = {
  restaurantId: string;
  tableId?: string;
  diningSessionId?: string;
  guestId?: string | null;
  kitchen?: boolean;
};
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly tickets = new Map<string, { identity: Identity; expiresAt: number }>();
  private readonly clients = new Map<Socket, Identity>();
  private timer?: ReturnType<typeof setInterval>;
  private server?: Server;
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
  ) {}
  attach(server: Server) {
    this.server = server;
    this.timer = setInterval(() => {
      void this.revalidate();
    }, 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.tickets.clear();
    for (const socket of this.clients.keys()) socket.disconnect(true);
    this.clients.clear();
  }
  private issue(identity: Identity) {
    const now = Date.now();
    for (const [key, entry] of this.tickets) if (entry.expiresAt <= now) this.tickets.delete(key);
    if (this.tickets.size >= 10000)
      throw new ServiceUnavailableException('Kết nối trực tiếp đang bận. Vui lòng thử lại');
    const ticket = randomBytes(32).toString('base64url'),
      expiresAt = now + 60000;
    this.tickets.set(hash(ticket), { identity, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt) };
  }
  staffTicket(staff: StaffPrincipal, token: string) {
    return this.issue({ kind: 'staff', staff, token });
  }
  guestTicket(identity: GuestIdentity) {
    return this.issue(identity);
  }
  async consume(value: unknown): Promise<Identity> {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value))
      throw new UnauthorizedException();
    const entry = this.tickets.get(hash(value));
    this.tickets.delete(hash(value)); // Single use, including failed handshakes.
    if (!entry || entry.expiresAt <= Date.now() || !(await this.valid(entry.identity)))
      throw new UnauthorizedException();
    return entry.identity;
  }
  private async valid(identity: Identity): Promise<boolean> {
    try {
      if (identity.kind === 'staff') {
        const staff = await this.auth.authenticate(identity.token);
        return (
          staff.restaurantId === identity.staff.restaurantId &&
          staff.role === identity.staff.role &&
          staff.membershipId === identity.staff.membershipId
        );
      }
      return !!(await this.db.guestSession.findFirst({
        where: {
          id: identity.guestId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          diningSessionId: identity.diningSessionId,
          diningSession: {
            restaurantId: identity.restaurantId,
            status: { in: ['OPEN', 'PAYMENT_REQUESTED'] },
            table: {
              id: identity.tableId,
              publicCode: identity.code,
              status: 'OCCUPIED',
              archivedAt: null,
            },
          },
        },
      }));
    } catch {
      return false;
    }
  }
  register(socket: Socket, identity: Identity) {
    const key = identity.kind === 'staff' ? identity.staff.authSessionId : identity.guestId;
    if (
      [...this.clients.values()].filter(
        (other) => (other.kind === 'staff' ? other.staff.authSessionId : other.guestId) === key,
      ).length >= 8
    ) {
      socket.disconnect(true);
      return;
    }
    this.clients.set(socket, identity);
    if (identity.kind === 'staff')
      void socket.join(`staff:${identity.staff.restaurantId}:${identity.staff.role}`);
    else {
      void socket.join(`guest:${identity.guestId}`);
      void socket.join(`session:${identity.diningSessionId}`);
    }
    socket.on('disconnect', () => this.clients.delete(socket));
    // No client-selected room or socket mutation endpoints exist.
    socket.on('join', (_value: unknown, ack?: unknown) => {
      if (typeof ack === 'function') (ack as (value: unknown) => void)({ ok: false });
    });
    socket.on('subscribe', (_value: unknown, ack?: unknown) => {
      if (typeof ack === 'function') (ack as (value: unknown) => void)({ ok: false });
    });
    socket.emit('realtime.ready');
  }
  async revalidate() {
    await Promise.all(
      [...this.clients].map(async ([socket, identity]) => {
        if (!(await this.valid(identity))) {
          socket.emit('realtime.expired');
          socket.disconnect(true);
        }
      }),
    );
  }
  private matches(identity: Identity, scope: EventScope, kind: RealtimeEvent['kind']) {
    if (identity.kind === 'guest')
      return kind.startsWith('order.')
        ? !!scope.guestId && scope.guestId === identity.guestId
        : scope.diningSessionId === identity.diningSessionId;
    if (identity.staff.restaurantId !== scope.restaurantId) return false;
    if (identity.staff.role === 'KITCHEN')
      return kind.startsWith('order.') ? !!scope.kitchen : !kind.startsWith('service_request.');
    return true;
  }
  async publish(kind: RealtimeEvent['kind'], scope: EventScope, orderId?: string) {
    if (!this.server) return;
    const event: RealtimeEvent = {
      id: randomUUID(),
      kind,
      occurredAt: new Date().toISOString(),
      ...(scope.tableId ? { tableId: scope.tableId } : {}),
      ...(scope.diningSessionId ? { diningSessionId: scope.diningSessionId } : {}),
      ...(orderId ? { orderId } : {}),
    };
    try {
      await Promise.all(
        [...this.clients].map(async ([socket, identity]) => {
          if (!this.matches(identity, scope, kind)) return;
          // Closing hints contain no order/request data; invalidate before disconnecting the revoked guest.
          if (identity.kind === 'guest' && kind === 'dining_session.closed') {
            socket.emit('dineflow.event', event);
            socket.disconnect(true);
            return;
          }
          if (!(await this.valid(identity))) {
            socket.emit('realtime.expired');
            socket.disconnect(true);
            return;
          }
          socket.emit('dineflow.event', event);
        }),
      );
    } catch {
      this.logger.warn('Realtime delivery failed after commit; REST remains authoritative');
    }
  }
}

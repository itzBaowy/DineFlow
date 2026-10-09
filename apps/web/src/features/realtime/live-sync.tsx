'use client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import {
  realtimePath,
  realtimeTicketSchema,
  realtimeEventSchema,
  staffPrincipalSchema,
} from '@dineflow/shared';
import { Radio, WifiOff, RefreshCw, Bell } from 'lucide-react';
import { api, apiOrigin } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function LiveSync({
  ticketPath,
  staff = false,
}: {
  ticketPath: string;
  staff?: boolean;
}) {
  const client = useQueryClient();
  const [state, setState] = useState({ key: '', connected: false, notice: '' });
  useEffect(() => {
    let disposed = false,
      socket: Socket | undefined,
      retry: ReturnType<typeof setTimeout> | undefined,
      attempts = 0,
      connecting = false;
    const seen = new Set<string>();
    const invalidate = () => {
      const prefixes = staff
        ? [
            'operations',
            'setup',
            'service-requests',
            'restaurant',
            'billing',
            'admin-reports',
            'admin-history',
            'admin-activity',
            'admin-staff',
          ]
        : [
            'customer-orders',
            'customer-menu',
            'customer-guest',
            'guest-service-requests',
            'guest-bill',
          ];
      for (const prefix of prefixes) void client.invalidateQueries({ queryKey: [prefix] });
    };
    const schedule = () => {
      if (disposed || retry || !navigator.onLine) return;
      setState((previous) => ({ ...previous, key: ticketPath, connected: false }));
      retry = setTimeout(
        () => {
          retry = undefined;
          void connect();
        },
        Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)),
      );
    };
    async function connect() {
      if (disposed || connecting || !navigator.onLine) return;
      connecting = true;
      socket?.removeAllListeners();
      socket?.disconnect();
      try {
        if (staff)
          client.setQueryData(['auth', 'me'], await api('/auth/me', staffPrincipalSchema));
        const { ticket } = await api(ticketPath, realtimeTicketSchema, {
          method: 'POST',
          body: {},
          refresh: false,
        });
        if (disposed || !navigator.onLine) return;
        const next = io(apiOrigin || window.location.origin, {
          path: realtimePath,
          addTrailingSlash: false,
          auth: { ticket },
          autoConnect: false,
          reconnection: false,
          withCredentials: false,
          timeout: 10000,
        });
        socket = next;
        next.on('realtime.ready', () => {
          attempts = 0;
          setState((previous) => ({ ...previous, key: ticketPath, connected: true }));
          invalidate();
        });
        next.on('dineflow.event', (value: unknown) => {
          const parsed = realtimeEventSchema.safeParse(value);
          if (!parsed.success || seen.has(parsed.data.id)) return;
          if (seen.size >= 256) seen.clear();
          seen.add(parsed.data.id);
          invalidate();
          if (
            staff &&
            ['order.created', 'order.accepted', 'service_request.created'].includes(
              parsed.data.kind,
            )
          )
            setState((previous) => ({
              ...previous,
              notice:
                parsed.data.kind === 'service_request.created'
                  ? 'Có yêu cầu phục vụ mới tại bàn.'
                  : 'Có đơn mới trong hàng đợi.',
            }));
        });
        next.on('realtime.expired', invalidate);
        next.on('disconnect', schedule);
        next.on('connect_error', schedule);
        next.connect();
      } catch {
        if (staff) void client.invalidateQueries({ queryKey: ['auth', 'me'] });
        invalidate();
        schedule();
      } finally {
        connecting = false;
      }
    }
    const resume = () => {
      if (!socket?.connected && !disposed) {
        if (retry) clearTimeout(retry);
        retry = undefined;
        void connect();
      }
    };
    const visible = () => {
      if (document.visibilityState === 'visible') {
        invalidate();
        resume();
      }
    };
    const offline = () => {
      if (retry) clearTimeout(retry);
      retry = undefined;
      socket?.disconnect();
      setState((previous) => ({ ...previous, key: ticketPath, connected: false }));
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', visible);
    void connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      socket?.removeAllListeners();
      socket?.disconnect();
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [ticketPath, staff, client]);
  const connected = state.key === ticketPath && state.connected;
  return (
    <div className="my-4 space-y-3" data-live-connected={connected}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/70 px-4 py-3 text-xs">
        <p
          role="status"
          className={`flex items-center gap-2 ${connected ? 'text-primary' : 'text-muted-foreground'}`}
        >
          {connected ? <Radio className="size-4" /> : <WifiOff className="size-4" />}
          {connected ? 'Đang đồng bộ' : 'Đang kết nối lại · Có thể cập nhật thủ công'}
        </p>
        {!connected && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void client.invalidateQueries();
            }}
          >
            <RefreshCw />
            Cập nhật dữ liệu
          </Button>
        )}
      </div>
      {staff && state.notice && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border bg-accent/40 px-4 py-3 text-xs text-primary"
        >
          <Bell className="size-4 shrink-0" />
          <p className="flex-1">{state.notice}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setState((previous) => ({ ...previous, notice: '' }))}
          >
            Đã xem
          </Button>
        </div>
      )}
    </div>
  );
}

'use client';
import { createContext, useContext, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { z } from 'zod';
import {
  createOrderInputSchema,
  guestSchema,
  orderLineInputSchema,
  orderSchema,
  publicMenuSchema,
  type CreateOrderInput,
  type PublicMenu,
} from '@dineflow/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { QueryState } from '@/features/setup/shared';
import { LiveSync } from '@/features/realtime/live-sync';
import { TableService } from '@/features/realtime/table-service';

const cartLineSchema = orderLineInputSchema.extend({ cartId: z.uuid() });
const cartSchema = z.object({
  lines: z.array(cartLineSchema).max(20),
  note: z.string().max(500),
  pending: createOrderInputSchema.nullable(),
});
type Cart = z.infer<typeof cartSchema>;
export type CartLine = z.infer<typeof cartLineSchema>;
const emptyCart: Cart = { lines: [], note: '', pending: null };
// SessionStorage stores only the cart and immutable retry payload, never the guest credential.
function createCartStore(key: string) {
  let snapshot = emptyCart,
    initialized = false;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      if (!initialized && typeof window !== 'undefined') {
        initialized = true;
        try {
          const parsed = cartSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? 'null'));
          if (parsed.success) snapshot = parsed.data;
        } catch {
          /* Start with an empty cart if storage is corrupt or disabled. */
        }
      }
      return snapshot;
    },
    getServerSnapshot: () => emptyCart,
    save(next: Cart) {
      sessionStorage.setItem(key, JSON.stringify(next));
      snapshot = next;
      initialized = true;
      listeners.forEach((listener) => listener());
    },
  };
}
type CustomerContext = {
  code: string;
  menuHref: string;
  cartHref: string;
  ordersHref: string;
  canOrder: boolean;
  isStaff: boolean;
  menu: PublicMenu;
  guest: z.infer<typeof guestSchema> | null;
  cart: Cart;
  save: (cart: Cart) => boolean;
  error: string | null;
  setError: (error: string | null) => void;
  locked: boolean;
  checkout: () => void;
  sending: boolean;
  reload: () => void;
};
const Context = createContext<CustomerContext | null>(null);
export function useCustomer() {
  const value = useContext(Context);
  if (!value) throw new Error('Customer provider missing');
  return value;
}
export function priceLine(line: CartLine, menu: PublicMenu) {
  const item = menu.items.find((item) => item.id === line.menuItemId);
  if (!item) return { item: null, valid: false, unitPrice: 0, total: 0, options: [] };
  const options = item.modifierGroups
    .flatMap((group) => group.options)
    .filter((option) => line.modifierOptionIds.includes(option.id));
  const valid =
    item.isAvailable &&
    options.length === line.modifierOptionIds.length &&
    options.every((option) => option.isAvailable) &&
    item.modifierGroups.every((group) => {
      const count = group.options.filter((option) =>
        line.modifierOptionIds.includes(option.id),
      ).length;
      return count >= group.minSelections && count <= group.maxSelections;
    });
  const unitPrice = item.basePrice + options.reduce((sum, option) => sum + option.priceDelta, 0);
  return { item, valid, options, unitPrice, total: unitPrice * line.quantity };
}
export function CustomerProvider({ code, children }: { code: string; children: React.ReactNode }) {
  const query = useQuery({
    queryKey: ['customer-menu', code],
    queryFn: ({ signal }) =>
      api(`/public/tables/${encodeURIComponent(code)}/menu`, publicMenuSchema, {
        signal,
        refresh: false,
      }),
  });
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-8">
        <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
          {query.data && (
            <CustomerSession
              key={`${code}:${query.data.diningSessionId ?? 'unopened'}`}
              code={code}
              menu={query.data}
              reload={() => {
                void query.refetch();
              }}
            >
              {children}
            </CustomerSession>
          )}
        </QueryState>
      </div>
    </div>
  );
}
function CustomerSession({
  code,
  menu,
  reload,
  children,
}: {
  code: string;
  menu: PublicMenu;
  reload: () => void;
  children: React.ReactNode;
}) {
  const client = useQueryClient();
  const path = `/public/tables/${encodeURIComponent(code)}`;
  const guestKey = ['customer-guest', code, menu.diningSessionId];
  const guestQuery = useQuery({
    queryKey: guestKey,
    queryFn: ({ signal }) => api(`${path}/guest`, guestSchema, { signal, refresh: false }),
    enabled: !!menu.diningSessionId,
    retry: false,
  });
  const admission = useMutation({
    mutationFn: () =>
      api(`${path}/guest`, guestSchema, {
        method: 'POST',
        body: { diningSessionId: menu.diningSessionId },
        refresh: false,
      }),
    onSuccess: (data) => {
      client.setQueryData(guestKey, data);
    },
    onError: () => reload(),
  });
  const guest =
    guestQuery.error instanceof ApiError && guestQuery.error.status === 401
      ? null
      : (guestQuery.data ?? null);
  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b pb-5">
        <Link href={`/t/${code}`} className="min-w-0">
          <div className="flex items-center gap-3">
            {menu.restaurant.logoUrl && (
              <Image
                src={menu.restaurant.logoUrl}
                alt=""
                width={40}
                height={40}
                unoptimized
                className="rounded-lg"
              />
            )}
            <p className="editorial break-words text-2xl text-primary">{menu.restaurant.name}</p>
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={`size-1.5 rounded-full ${menu.orderingEnabled ? 'bg-primary' : 'bg-amber-500'}`}
            />
            {menu.table.name} · {menu.orderingEnabled ? 'Đang phục vụ' : 'Chưa nhận đơn'}
          </p>
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${code}/orders`}>
            <ClipboardList />
            Đơn đã đặt
          </Link>
        </Button>
      </header>
      {guest && <nav className="mt-4 flex flex-wrap gap-3 text-xs" aria-label="Lượt phục vụ"><Link className="font-semibold text-primary underline underline-offset-4" href={`/t/${code}/bill`}>Hóa đơn tạm tính</Link></nav>}
      {guest && menu.diningSessionId && (
        <LiveSync key={guest.id} ticketPath={`${path}/realtime-ticket`} />
      )}
      {!menu.orderingEnabled ? (
        <section className="mt-5 rounded-2xl border bg-white p-5">
          <h2 className="text-sm font-semibold">
            {menu.diningSessionId ? 'Bàn đang chờ thanh toán' : 'Chào mừng bạn đến bàn'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {menu.diningSessionId
              ? 'Bàn tạm ngừng nhận món mới. Nhân viên sẽ đến hỗ trợ; tiền chưa được ghi nhận thanh toán.'
              : 'Bàn chưa mở hoặc đã ngừng nhận đơn. Bạn có thể xem thực đơn; vui lòng báo nhân viên để được phục vụ.'}
          </p>
          <Button onClick={reload} variant="outline" className="mt-3" size="sm">
            <RefreshCw />
            Kiểm tra lại bàn
          </Button>
        </section>
      ) : (
        !guest && (
          <section className="mt-5 rounded-2xl border bg-secondary p-5">
            <h2 className="text-sm font-semibold">Sẵn sàng chọn món?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Bắt đầu tại {menu.table.name} để đặt món và xem các đơn bạn đã gửi.
            </p>
            {guestQuery.isPending ? (
              <p role="status" className="mt-3 text-sm">
                Đang kiểm tra phiên khách…
              </p>
            ) : (
              <Button
                className="mt-3"
                disabled={admission.isPending}
                onClick={() => admission.mutate()}
              >
                <UtensilsCrossed />
                {admission.isPending ? 'Đang bắt đầu…' : 'Bắt đầu gọi món'}
              </Button>
            )}
            {guestQuery.error &&
              !(guestQuery.error instanceof ApiError && guestQuery.error.status === 401) && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {guestQuery.error.message}
                </p>
              )}
            {admission.error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {admission.error.message}
              </p>
            )}
          </section>
        )
      )}
      <CartProvider
        key={`${menu.diningSessionId}:${guest?.id ?? 'anonymous'}`}
        code={code}
        menu={menu}
        guest={guest}
        reload={() => {
          reload();
          void guestQuery.refetch();
        }}
      >
        {children}
      </CartProvider>
      {guest && menu.diningSessionId && (
        <TableService code={code} sessionId={menu.diningSessionId} />
      )}
      <footer className="editorial mt-12 border-t pt-6 text-center text-sm italic text-muted-foreground">
        Một bữa ngon, một khoảng vui.
        <span className="mt-2 block font-sans text-[10px] not-italic">
          {menu.restaurant.address} · DineFlow
        </span>
      </footer>
    </>
  );
}
export function CartProvider({
  code,
  menu,
  guest,
  reload,
  children,
  manual,
}: {
  code: string;
  menu: PublicMenu;
  guest: CustomerContext['guest'];
  reload: () => void;
  children: React.ReactNode;
  manual?: { sessionId: string; userId: string };
}) {
  const router = useRouter(),
    client = useQueryClient();
  const [store] = useState(() =>
    createCartStore(
      manual
        ? `dineflow:cart:staff:${manual.userId}:${manual.sessionId}`
        : `dineflow:cart:${code}:${menu.diningSessionId}:${guest?.id ?? 'anonymous'}`,
    ),
  );
  const cart = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [error, setError] = useState<string | null>(null);
  const menuHref = manual ? `/staff/tables/${manual.sessionId}/order` : `/t/${code}`;
  const cartHref = `${menuHref}/cart`,
    ordersHref = manual ? '/staff/orders' : `/t/${code}/orders`;
  function save(next: Cart) {
    try {
      store.save(next);
      setError(null);
      return true;
    } catch {
      setError(
        'Không thể lưu giỏ hàng trong trình duyệt. Vui lòng cho phép bộ nhớ phiên và thử lại.',
      );
      return false;
    }
  }
  const submit = useMutation({
    mutationFn: ({ body }: { body: CreateOrderInput; retry: boolean }) =>
      api(
        manual
          ? `/dining-sessions/${manual.sessionId}/orders`
          : `/public/tables/${encodeURIComponent(code)}/orders`,
        orderSchema,
        {
          method: 'POST',
          body,
          refresh: false,
        },
      ),
    onSuccess: () => {
      store.save(emptyCart);
      void client.invalidateQueries({ queryKey: ['customer-orders', code] });
      if (manual) {
        void client.invalidateQueries({ queryKey: ['operations'] });
        void client.invalidateQueries({ queryKey: ['setup'] });
      }
      router.push(ordersHref);
    },
    onError: (err, attempt) => {
      setError(err.message);
      // Only an explicit rejection of the initial attempt lets the visitor edit the cart.
      // A retry can be throttled even if the original request committed successfully;
      // never discard its key/payload after an unknown result or a page reload.
      if (!attempt.retry && err instanceof ApiError && err.status >= 400 && err.status < 500) {
        try {
          store.save({ ...store.getSnapshot(), pending: null });
        } catch {
          /* Keep the safer immutable retry state. */
        }
        reload();
      }
    },
  });
  function checkout() {
    setError(null);
    if (!(guest || manual) || !menu.orderingEnabled || !menu.diningSessionId) {
      setError('Phiên khách chưa sẵn sàng nhận đơn. Vui lòng kiểm tra lại bàn.');
      reload();
      return;
    }
    if (cart.pending) {
      submit.mutate({ body: cart.pending, retry: true });
      return;
    }
    const prices = cart.lines.map((line) => priceLine(line, menu));
    if (!prices.length || prices.some((price) => !price.valid)) {
      setError('Có món hoặc tùy chọn đã ngừng bán. Vui lòng cập nhật giỏ hàng.');
      return;
    }
    const body: CreateOrderInput = {
      idempotencyKey: crypto.randomUUID(),
      diningSessionId: menu.diningSessionId,
      expectedTotal: prices.reduce((sum, price) => sum + price.total, 0),
      note: cart.note.trim() || null,
      items: cart.lines.map(({ cartId: _cartId, ...line }) => {
        void _cartId;
        return line;
      }),
    };
    const parsed = createOrderInputSchema.safeParse(body);
    if (!parsed.success) {
      setError('Giỏ hàng vượt giới hạn cho phép. Vui lòng giảm số món hoặc tổng giá trị đơn.');
      return;
    }
    if (save({ ...cart, pending: body })) submit.mutate({ body, retry: false });
  }
  return (
    <Context.Provider
      value={{
        code,
        menuHref,
        cartHref,
        ordersHref,
        canOrder: !!(guest || manual) && menu.orderingEnabled,
        isStaff: !!manual,
        menu,
        guest,
        cart,
        save,
        error,
        setError,
        locked: !!cart.pending || submit.isPending,
        checkout,
        sending: submit.isPending,
        reload,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function BackToMenu() {
  const { menuHref } = useCustomer();
  return (
    <Link
      href={menuHref}
      className="mb-5 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-primary"
    >
      <ArrowLeft className="size-4" />
      Về thực đơn
    </Link>
  );
}

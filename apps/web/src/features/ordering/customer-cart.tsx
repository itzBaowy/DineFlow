'use client';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { formatVnd } from '@dineflow/shared';
import { Button } from '@/components/ui/button';
import { textareaClass, EmptyState } from '@/features/setup/shared';
import { BackToMenu, priceLine, useCustomer } from './customer-provider';

export function CustomerCart() {
  const { code, menu, guest, cart, save, error, locked, checkout, sending, reload } = useCustomer();
  const total = cart.lines.reduce((sum, line) => sum + priceLine(line, menu).total, 0);
  const invalid = cart.lines.some((line) => !priceLine(line, menu).valid);
  return (
    <section className="mt-5">
      <BackToMenu />
      <h1 className="editorial text-4xl text-primary">Giỏ hàng của bạn</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Kiểm tra món trước khi gửi. Bạn có thể gọi thêm trong cùng phiên bàn.
      </p>
      {!cart.lines.length ? (
        <div className="mt-6">
          <EmptyState>
            <ShoppingBag className="mx-auto mb-4 size-8 text-primary/40" />
            Giỏ hàng đang trống.
            <Button asChild className="mt-5">
              <Link href={`/t/${code}`}>Khám phá thực đơn</Link>
            </Button>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {cart.lines.map((line) => {
              const price = priceLine(line, menu);
              return (
                <article key={line.cartId} className="rounded-2xl border bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">
                        {price.item?.name ?? 'Món đã ngừng bán'}
                      </h2>
                      <p className="mt-2 text-xs leading-6 text-muted-foreground">
                        {price.options.map((option) => option.name).join(' · ')}
                      </p>
                      {line.note && (
                        <p className="text-xs text-muted-foreground">Ghi chú: {line.note}</p>
                      )}
                      {!price.valid && (
                        <p className="mt-2 text-xs text-destructive">
                          Món hoặc tùy chọn đã ngừng bán. Hãy xóa và chọn lại.
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Xóa ${price.item?.name ?? 'món'}`}
                      disabled={locked}
                      onClick={() =>
                        save({
                          ...cart,
                          lines: cart.lines.filter((item) => item.cartId !== line.cartId),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Giảm ${price.item?.name}`}
                        disabled={locked || line.quantity <= 1}
                        onClick={() =>
                          save({
                            ...cart,
                            lines: cart.lines.map((item) =>
                              item.cartId === line.cartId
                                ? { ...item, quantity: item.quantity - 1 }
                                : item,
                            ),
                          })
                        }
                      >
                        <Minus />
                      </Button>
                      <span className="w-5 text-center text-sm">{line.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Tăng ${price.item?.name}`}
                        disabled={locked || line.quantity >= 20}
                        onClick={() =>
                          save({
                            ...cart,
                            lines: cart.lines.map((item) =>
                              item.cartId === line.cartId
                                ? { ...item, quantity: item.quantity + 1 }
                                : item,
                            ),
                          })
                        }
                      >
                        <Plus />
                      </Button>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {formatVnd(price.total)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
          <label className="mt-6 block text-sm font-semibold">
            Ghi chú cho cả đơn
            <textarea
              aria-label="Ghi chú cho cả đơn"
              value={cart.note}
              maxLength={500}
              disabled={locked}
              onChange={(event) => save({ ...cart, note: event.target.value })}
              className={`${textareaClass} mt-3 font-normal`}
              placeholder="Nhắn thêm với nhà hàng…"
            />
          </label>
          <div className="mt-6 rounded-2xl border bg-white p-5">
            <div className="flex justify-between text-sm">
              <span>Tổng tiền món</span>
              <strong className="text-primary">{formatVnd(total)}</strong>
            </div>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Giá được kiểm tra khi gửi đơn. Thuế và phí dịch vụ (nếu có) được tính trên hóa đơn
              cuối tại nhà hàng.
            </p>
          </div>
          {cart.pending && (
            <p role="status" className="mt-5 rounded-xl border bg-amber-50 p-4 text-sm leading-6">
              Đang kiểm tra kết quả gửi đơn. Giỏ hàng được giữ nguyên; hãy thử lại để nhận kết quả
              của cùng yêu cầu.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-5 text-sm leading-6 text-destructive">
              {error}
            </p>
          )}
          {!locked && (
            <Button className="mt-4" variant="ghost" onClick={reload}>
              Cập nhật thực đơn và giá
            </Button>
          )}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
            <div className="mx-auto max-w-3xl">
              <Button
                className="w-full"
                disabled={sending || !guest || !menu.orderingEnabled || (invalid && !cart.pending)}
                onClick={checkout}
              >
                {sending
                  ? 'Đang gửi đơn…'
                  : cart.pending
                    ? 'Thử lại cùng đơn'
                    : `Xác nhận đặt món · ${formatVnd(total)}`}
              </Button>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Đơn mới chờ nhân viên xác nhận
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

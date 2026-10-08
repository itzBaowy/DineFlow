'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Dialog } from 'radix-ui';
import { ArrowRight, Minus, Plus, Search, ShoppingBag, UtensilsCrossed, X } from 'lucide-react';
import { formatVnd, type PublicMenuItem } from '@dineflow/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { textareaClass, EmptyState } from '@/features/setup/shared';
import { useCustomer, priceLine } from './customer-provider';

export function CustomerMenu() {
  const { code, menu, guest, cart, locked } = useCustomer();
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<PublicMenuItem | null>(null);
  const items = menu.items.filter(
    (item) =>
      (category === 'all' || item.categoryId === category) &&
      `${item.name} ${item.description ?? ''}`
        .toLocaleLowerCase('vi')
        .includes(search.toLocaleLowerCase('vi')),
  );
  const total = cart.lines.reduce((sum, line) => sum + priceLine(line, menu).total, 0),
    quantity = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <>
      <section className="my-6 flex items-center justify-between gap-4 rounded-2xl border bg-[#f1f0e9] p-5 sm:p-7">
        <div>
          <h1 className="editorial text-3xl leading-tight text-primary sm:text-4xl">
            Một bữa ngon,
            <br />
            một khoảng vui.
          </h1>
          <p className="mt-3 max-w-sm text-xs leading-6 text-muted-foreground">
            Chọn món bạn yêu thích. Mỗi đơn sẽ được nhân viên xác nhận trước khi nhà bếp chuẩn bị.
          </p>
        </div>
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-primary">
          <UtensilsCrossed className="size-6" strokeWidth={1.5} />
        </span>
      </section>
      <div className="relative">
        <Search className="absolute left-4 top-4 size-4 text-muted-foreground" />
        <Input
          aria-label="Tìm món ăn"
          placeholder="Tìm món ngon, đồ uống…"
          className="bg-white pl-11"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <nav aria-label="Danh mục thực đơn" className="my-4 flex gap-2 overflow-x-auto pb-2">
        {[{ id: 'all', name: `Tất cả (${menu.items.length})` }, ...menu.categories].map((item) => (
          <button
            key={item.id}
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
            className={`min-h-11 shrink-0 rounded-full border px-5 text-xs font-medium ${category === item.id ? 'border-primary bg-primary text-white' : 'bg-white text-muted-foreground'}`}
          >
            {item.name}
          </button>
        ))}
      </nav>
      <div className="space-y-3">
        {!items.length && (
          <EmptyState>
            {search
              ? 'Không tìm thấy món phù hợp. Thử từ khóa hoặc danh mục khác.'
              : 'Nhà hàng chưa có món trong danh mục này.'}
          </EmptyState>
        )}
        {items.map((item) => (
          <article
            key={item.id}
            className={`flex gap-4 rounded-2xl border bg-white p-4 ${!item.isAvailable ? 'bg-white/60' : ''}`}
          >
            <div
              className={`relative grid size-22 shrink-0 place-items-center overflow-hidden rounded-xl ${item.isAvailable ? 'bg-secondary' : 'bg-muted'}`}
            >
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  unoptimized
                  sizes="88px"
                  className="object-cover"
                />
              ) : (
                <UtensilsCrossed className="size-7 text-primary/35" strokeWidth={1.2} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">{item.name}</h2>
                {!item.isAvailable && (
                  <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                    Hết món
                  </span>
                )}
              </div>
              {item.description && (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {item.description}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-primary">{formatVnd(item.basePrice)}</p>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-11 rounded-full bg-background"
                  aria-label={`Chọn ${item.name}`}
                  disabled={!item.isAvailable || !guest || !menu.orderingEnabled || locked}
                  onClick={() => setSelected(item)}
                >
                  <Plus />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {(quantity > 0 || locked) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-2xl bg-primary px-5 py-3 text-white">
            <div className="flex items-center gap-3">
              <ShoppingBag className="size-5" />
              <div>
                <p className="text-xs font-semibold">{quantity} món đã chọn</p>
                <p className="mt-1 text-sm">{formatVnd(total)}</p>
              </div>
            </div>
            <Button asChild className="bg-accent text-primary hover:bg-accent/90">
              <Link href={`/t/${code}/cart`}>
                {locked ? 'Kiểm tra đơn' : 'Xem giỏ hàng'}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      )}
      {selected && <DishSheet key={selected.id} item={selected} close={() => setSelected(null)} />}
    </>
  );
}
function DishSheet({ item, close }: { item: PublicMenuItem; close: () => void }) {
  const { cart, save, setError, locked } = useCustomer();
  const [quantity, setQuantity] = useState(1),
    [options, setOptions] = useState<string[]>([]),
    [note, setNote] = useState(''),
    [error, setLocalError] = useState<string | null>(null);
  const unitPrice =
    item.basePrice +
    item.modifierGroups
      .flatMap((group) => group.options)
      .filter((option) => options.includes(option.id))
      .reduce((sum, option) => sum + option.priceDelta, 0);
  function add() {
    for (const group of item.modifierGroups) {
      const count = group.options.filter((option) => options.includes(option.id)).length;
      if (count < group.minSelections || count > group.maxSelections) {
        setLocalError(
          `${group.name}: chọn từ ${group.minSelections} đến ${group.maxSelections} lựa chọn.`,
        );
        return;
      }
    }
    if (options.length > 100) {
      setLocalError('Tối đa 100 tùy chọn cho một món.');
      return;
    }
    const same = cart.lines.find(
      (line) =>
        line.menuItemId === item.id &&
        line.note === (note.trim() || null) &&
        [...line.modifierOptionIds].sort().join() === [...options].sort().join(),
    );
    if (same && same.quantity + quantity > 20) {
      setLocalError('Tối đa 20 phần cho mỗi lựa chọn món trong một đơn.');
      return;
    }
    if (!same && cart.lines.length >= 20) {
      setLocalError('Tối đa 20 lựa chọn món trong một đơn. Bạn có thể gửi đơn rồi gọi thêm.');
      return;
    }
    const lines = same
      ? cart.lines.map((line) =>
          line.cartId === same.cartId ? { ...line, quantity: line.quantity + quantity } : line,
        )
      : [
          ...cart.lines,
          {
            cartId: crypto.randomUUID(),
            menuItemId: item.id,
            quantity,
            modifierOptionIds: options,
            note: note.trim() || null,
          },
        ];
    if (save({ ...cart, lines })) {
      setError(null);
      close();
    } else setLocalError('Không thể lưu giỏ hàng. Vui lòng cho phép bộ nhớ phiên của trình duyệt.');
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-primary/35 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] max-w-xl flex-col rounded-t-3xl bg-background shadow-xl sm:bottom-6 sm:rounded-3xl">
          <div className="flex items-start justify-between gap-4 border-b p-5">
            <div>
              <Dialog.Title className="editorial text-3xl text-primary">{item.name}</Dialog.Title>
              <Dialog.Description className="mt-2 text-xs leading-6 text-muted-foreground">
                {item.description ?? 'Chọn số lượng và tùy chọn theo khẩu vị của bạn.'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Đóng chọn món">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="space-y-6 overflow-y-auto p-5">
            {item.modifierGroups.map((group) => (
              <fieldset key={group.id}>
                <legend className="mb-3 text-sm font-semibold">
                  {group.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {group.minSelections
                      ? `Bắt buộc · chọn ${group.minSelections}–${group.maxSelections}`
                      : `Tùy chọn · tối đa ${group.maxSelections}`}
                  </span>
                </legend>
                <div className="space-y-2">
                  {group.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex min-h-12 items-center gap-3 rounded-xl border bg-white px-4 py-3 text-sm ${!option.isAvailable ? 'opacity-50' : ''}`}
                    >
                      <input
                        type={
                          group.maxSelections === 1 && group.minSelections === 1
                            ? 'radio'
                            : 'checkbox'
                        }
                        name={group.id}
                        className="size-4 accent-primary"
                        checked={options.includes(option.id)}
                        disabled={!option.isAvailable || locked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            const without =
                              group.maxSelections === 1
                                ? options.filter((id) => !group.options.some((o) => o.id === id))
                                : options;
                            setOptions([...without, option.id]);
                          } else setOptions(options.filter((id) => id !== option.id));
                          setLocalError(null);
                        }}
                      />
                      <span className="flex-1">
                        {option.name}
                        {!option.isAvailable && ' · Hết'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        +{formatVnd(option.priceDelta)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <label className="block text-sm font-semibold">
              Ghi chú món
              <textarea
                aria-label="Ghi chú món"
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={`${textareaClass} mt-3 font-normal`}
                placeholder="Ví dụ: ít đá, không hành…"
                disabled={locked}
              />
            </label>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Số lượng</p>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Giảm số lượng"
                  disabled={quantity <= 1 || locked}
                  onClick={() => setQuantity(quantity - 1)}
                >
                  <Minus />
                </Button>
                <span className="w-5 text-center">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Tăng số lượng"
                  disabled={quantity >= 20 || locked}
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus />
                </Button>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="border-t px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <Button onClick={add} disabled={locked} className="w-full">
              Thêm vào giỏ · {formatVnd(unitPrice * quantity)}
              <Plus />
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

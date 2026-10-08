'use client';
import Image from 'next/image';
import { useMutation } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { uploadSchema } from '@dineflow/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function ImageUpload({
  value,
  onChange,
  onBusyChange,
  label = 'Ảnh món ăn',
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  onBusyChange: (busy: boolean) => void;
  label?: string;
}) {
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api('/storage/images', uploadSchema, { method: 'POST', body: form });
    },
    onSuccess: (data) => onChange(data.imageUrl),
    onSettled: () => onBusyChange(false),
  });
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed bg-white p-4">
        {value ? (
          <Image
            unoptimized
            src={value}
            alt={label}
            width={88}
            height={88}
            className="size-22 rounded-xl object-cover"
          />
        ) : (
          <span className="grid size-20 place-items-center rounded-xl bg-secondary text-primary">
            <ImagePlus className="size-7" strokeWidth={1.5} />
          </span>
        )}
        <label className="min-w-0 flex-1 text-xs font-medium">
          <span className="mb-2 block">JPEG, PNG hoặc WebP · tối đa 5MB</span>
          <input
            type="file"
            aria-label={`Tải ${label.toLowerCase()}`}
            accept="image/jpeg,image/png,image/webp"
            disabled={upload.isPending}
            className="w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-primary"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onBusyChange(true);
                upload.mutate(file);
              }
              event.target.value = '';
            }}
          />
        </label>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={upload.isPending}
            onClick={() => onChange(null)}
          >
            Gỡ ảnh
          </Button>
        )}
      </div>
      {upload.isPending && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Đang tải ảnh lên…
        </p>
      )}
      {upload.isError && (
        <p role="alert" className="text-xs text-destructive">
          {upload.error.message}
        </p>
      )}
    </div>
  );
}

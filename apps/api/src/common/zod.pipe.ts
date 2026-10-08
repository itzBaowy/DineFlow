import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new BadRequestException({ message: 'Dữ liệu không hợp lệ', issues: result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) });
    return result.data;
  }
}

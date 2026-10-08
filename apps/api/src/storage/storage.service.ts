import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type {} from 'multer';
import type { StaffPrincipal } from '@dineflow/shared';
import { CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client | null;
  private readonly logger = new Logger(StorageService.name);
  private bucketReady: Promise<void> | null = null;
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: PrismaService,
  ) {
    this.client =
      config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? new S3Client({
            endpoint: config.S3_ENDPOINT,
            region: config.S3_REGION,
            forcePathStyle: true,
            credentials: {
              accessKeyId: config.S3_ACCESS_KEY_ID,
              secretAccessKey: config.S3_SECRET_ACCESS_KEY,
            },
            maxAttempts: 2,
            requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
          })
        : null;
  }
  onModuleDestroy() {
    this.client?.destroy();
  }
  private async ready() {
    if (!this.client) throw new ServiceUnavailableException('Storage chưa được cấu hình');
    if (!this.bucketReady)
      this.bucketReady = (async () => {
        try {
          await this.client!.send(new HeadBucketCommand({ Bucket: this.config.S3_BUCKET }));
        } catch (error) {
          if (
            !(
              error instanceof S3ServiceException &&
              error.$metadata.httpStatusCode === 404 &&
              this.config.S3_AUTO_CREATE_BUCKET
            )
          )
            throw error;
          try {
            await this.client!.send(new CreateBucketCommand({ Bucket: this.config.S3_BUCKET }));
          } catch (createError) {
            if (
              !(
                createError instanceof S3ServiceException &&
                createError.name === 'BucketAlreadyOwnedByYou'
              )
            )
              throw createError;
          }
        }
      })().catch(() => {
        this.bucketReady = null;
        throw new ServiceUnavailableException('Không thể kết nối kho ảnh');
      });
    await this.bucketReady;
  }
  async upload(staff: StaffPrincipal, file?: Express.Multer.File) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      throw new BadRequestException('Chọn ảnh JPEG, PNG hoặc WebP tối đa 5MB');
    let image: Buffer;
    try {
      const input = sharp(file.buffer, {
        limitInputPixels: 16000000,
        failOn: 'warning',
        animated: false,
      });
      const metadata = await input.metadata();
      const expected: Record<string, string> = {
        'image/jpeg': 'jpeg',
        'image/png': 'png',
        'image/webp': 'webp',
      };
      if (metadata.format !== expected[file.mimetype] || (metadata.pages ?? 1) > 1)
        throw new Error('Invalid format');
      image = await input
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException('Ảnh bị lỗi, sai định dạng hoặc vượt 16 triệu điểm ảnh');
    }
    await this.ready();
    const id = randomUUID();
    const objectKey = `${staff.restaurantId}/${id}.webp`;
    try {
      await this.client!.send(
        new PutObjectCommand({
          Bucket: this.config.S3_BUCKET,
          Key: objectKey,
          Body: image,
          ContentType: 'image/webp',
        }),
      );
    } catch {
      throw new ServiceUnavailableException('Không thể lưu ảnh, vui lòng thử lại');
    }
    try {
      await this.db.$transaction(async (tx) => {
        await tx.mediaAsset.create({
          data: {
            id,
            restaurantId: staff.restaurantId,
            objectKey,
            mimeType: 'image/webp',
            size: image.length,
          },
        });
        await tx.activityLog.create({
          data: {
            restaurantId: staff.restaurantId,
            actorUserId: staff.userId,
            action: 'image.uploaded',
            entityType: 'MediaAsset',
            entityId: id,
          },
        });
      });
    } catch (error) {
      await this.client!.send(
        new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: objectKey }),
      ).catch(() => this.logger.error('Không thể dọn ảnh upload chưa được ghi nhận'));
      throw error;
    }
    return { id, imageUrl: `/api/v1/storage/images/${id}` };
  }
  async image(id: string) {
    const asset = await this.db.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Không tìm thấy ảnh');
    if (!this.client) throw new ServiceUnavailableException('Storage chưa được cấu hình');
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: asset.objectKey }),
      );
      if (!object.Body) throw new Error('Missing body');
      return Buffer.from(await object.Body.transformToByteArray());
    } catch {
      throw new ServiceUnavailableException('Không thể tải ảnh từ kho lưu trữ');
    }
  }
}

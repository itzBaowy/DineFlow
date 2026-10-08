import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { CONFIG, type AppConfig } from '../src/config/env';
import { hashPassword } from '../src/auth/password';
import { testDatabaseUrl } from './test-env';

test('Phase 2 setup with real PostgreSQL, QR decoding and MinIO', async (t) => {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  const app = await createApp(false);
  const db = app.get(PrismaService);
  const auth = app.get(AuthService);
  const config = app.get<AppConfig>(CONFIG);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`;
  const suffix = randomUUID();
  const restaurants = await Promise.all(
    ['primary', 'other'].map((label) =>
      db.restaurant.create({ data: { slug: `setup-${label}-${suffix}`, name: label } }),
    ),
  );
  const restaurant = restaurants[0]!;
  const other = restaurants[1]!;
  const password = randomBytes(20).toString('hex');
  const passwordHash = await hashPassword(password);
  const users = await Promise.all(
    (['OWNER', 'MANAGER', 'WAITER'] as const).map((role) =>
      db.user.create({
        data: {
          email: `${role}.${suffix}@setup.test`,
          name: role,
          passwordHash,
          memberships: { create: { restaurantId: restaurant.id, role } },
        },
      }),
    ),
  );
  const cookies = await Promise.all(
    users.map(
      async (user) =>
        `df_access=${(await auth.login({ email: user.email, password })).accessToken}`,
    ),
  );
  const cookie = cookies[0]!;
  const headers = {
    'Content-Type': 'application/json',
    'X-DineFlow-Client': 'web',
    Origin: config.APP_ORIGIN,
    Cookie: cookie,
  };
  async function request(path: string, method = 'GET', data: unknown = {}, credential = cookie) {
    return fetch(`${base}${path}`, {
      method,
      headers: { ...headers, Cookie: credential },
      ...(method !== 'GET' ? { body: JSON.stringify(data) } : {}),
    });
  }
  async function json<T>(response: Response, status = 201): Promise<T> {
    assert.equal(response.status, status, await response.clone().text());
    return response.json() as Promise<T>;
  }
  const categoryInput = { name: 'Đồ uống', description: null, position: 0, isActive: true };
  const groupInput = {
    name: 'Size',
    minSelections: 1,
    maxSelections: 1,
    position: 0,
    options: [
      { name: 'M', priceDelta: 0, isAvailable: true, position: 0 },
      { name: 'L', priceDelta: 5000, isAvailable: true, position: 1 },
    ],
  };
  let categoryId = '',
    groupId = '',
    itemId = '',
    tableId = '',
    uploadedId = '';
  const foreignCategory = await db.menuCategory.create({
    data: { ...categoryInput, restaurantId: other.id },
  });
  const foreignGroup = await db.modifierGroup.create({
    data: { name: 'Foreign', restaurantId: other.id },
  });
  const foreignTable = await db.diningTable.create({
    data: {
      name: 'Foreign',
      restaurantId: other.id,
      publicCode: randomBytes(24).toString('base64url'),
    },
  });
  const itemInput = () => ({
    name: 'Trà sữa',
    description: 'Trà thơm',
    categoryId,
    imageUrl: null as string | null,
    basePrice: 35000,
    isAvailable: true,
    position: 0,
    modifierGroupIds: [groupId],
  });
  try {
    await t.test(
      'RBAC protects setup reads/writes and rejects client tenant overrides',
      async () => {
        for (const path of ['/menu/items', '/menu/categories', '/menu/modifiers', '/tables'])
          assert.equal((await request(path, 'GET', {}, cookies[2])).status, 403);
        assert.equal(
          (await request('/menu/categories', 'POST', categoryInput, cookies[2])).status,
          403,
        );
        assert.equal(
          (await request('/menu/categories', 'POST', { ...categoryInput, restaurantId: other.id }))
            .status,
          400,
        );
        assert.equal((await request('/tables')).status, 200);
        assert.equal((await request('/tables', 'GET', {}, '')).status, 401);
        assert.equal((await request('/menu/categories', 'GET', {}, cookies[1])).status, 200);
      },
    );
    await t.test(
      'category and modifier CRUD preserve IDs and validate selectable options',
      async () => {
        categoryId = (
          await json<{ id: string }>(await request('/menu/categories', 'POST', categoryInput))
        ).id;
        groupId = (await json<{ id: string }>(await request('/menu/modifiers', 'POST', groupInput)))
          .id;
        assert.equal(
          (await request(`/menu/categories/${foreignCategory.id}`, 'PATCH', categoryInput)).status,
          404,
        );
        const groups = await json<
          {
            id: string;
            options: {
              id: string;
              name: string;
              priceDelta: number;
              isAvailable: boolean;
              position: number;
            }[];
          }[]
        >(await request('/menu/modifiers'), 200);
        const options = groups.find((group) => group.id === groupId)!.options;
        await json(
          await request(`/menu/modifiers/${groupId}`, 'PATCH', { ...groupInput, options }),
          200,
        );
        assert.equal(
          (
            await request(`/menu/modifiers/${groupId}`, 'PATCH', {
              ...groupInput,
              options: options.map((option) => ({ ...option, isAvailable: false })),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request(`/menu/modifiers/${groupId}`, 'PATCH', {
              ...groupInput,
              options: [{ ...options[0], id: randomUUID() }],
            })
          ).status,
          400,
        );
      },
    );
    await t.test('menu validates prices and references; edits persist in PostgreSQL', async () => {
      assert.equal(
        (await request('/menu/items', 'POST', { ...itemInput(), basePrice: 0.1 })).status,
        400,
      );
      assert.equal(
        (await request('/menu/items', 'POST', { ...itemInput(), categoryId: foreignCategory.id }))
          .status,
        400,
      );
      assert.equal(
        (
          await request('/menu/items', 'POST', {
            ...itemInput(),
            modifierGroupIds: [foreignGroup.id],
          })
        ).status,
        400,
      );
      itemId = (await json<{ id: string }>(await request('/menu/items', 'POST', itemInput()))).id;
      assert.equal((await request(`/menu/categories/${categoryId}`, 'DELETE')).status, 409);
      assert.equal((await request(`/menu/modifiers/${groupId}`, 'DELETE')).status, 409);
      await json(
        await request(`/menu/items/${itemId}`, 'PATCH', {
          ...itemInput(),
          basePrice: 40000,
          isAvailable: false,
        }),
        200,
      );
      const item = await db.menuItem.findUniqueOrThrow({ where: { id: itemId } });
      assert.equal(item.basePrice, 40000);
      assert.equal(item.isAvailable, false);
      await json(
        await request(`/menu/categories/${categoryId}`, 'PATCH', {
          ...categoryInput,
          isActive: false,
        }),
        200,
      );
      const rows = await json<{ id: string; categoryActive: boolean }[]>(
        await request('/menu/items'),
        200,
      );
      assert.equal(rows.find((row) => row.id === itemId)!.categoryActive, false);
    });
    await t.test(
      'MinIO upload rejects invalid files and CSRF, stores normalized WebP, checks image ownership',
      async () => {
        const png = await sharp({
          create: { width: 24, height: 24, channels: 3, background: '#d9edb0' },
        })
          .png()
          .toBuffer();
        const upload = (
          bytes: Uint8Array,
          mime = 'image/png',
          credential = cookie,
          origin = config.APP_ORIGIN,
        ) => {
          const form = new FormData();
          form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), 'image.png');
          return fetch(`${base}/storage/images`, {
            method: 'POST',
            headers: { Cookie: credential, 'X-DineFlow-Client': 'web', Origin: origin },
            body: form,
          });
        };
        assert.equal((await upload(png, 'image/png', cookies[2])).status, 403);
        assert.equal(
          (await upload(png, 'image/png', cookie, 'https://attacker.example')).status,
          403,
        );
        assert.equal((await upload(Buffer.from('<svg/>'), 'image/svg+xml')).status, 400);
        assert.equal((await upload(Buffer.from('fakepng'))).status, 400);
        assert.equal((await upload(Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
        const result = await json<{ id: string; imageUrl: string }>(await upload(png));
        uploadedId = result.id;
        const image = await request(result.imageUrl.replace('/api/v1', ''), 'GET', {}, '');
        assert.equal(image.status, 200);
        assert.match(image.headers.get('content-type')!, /image\/webp/);
        const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
        assert.equal(meta.format, 'webp');
        assert.equal(meta.width, 24);
        await json(
          await request(`/menu/items/${itemId}`, 'PATCH', {
            ...itemInput(),
            imageUrl: result.imageUrl,
          }),
          200,
        );
        const foreignAsset = await db.mediaAsset.create({
          data: {
            restaurantId: other.id,
            objectKey: `test/${randomUUID()}`,
            mimeType: 'image/webp',
            size: 1,
          },
        });
        assert.equal(
          (
            await request(`/menu/items/${itemId}`, 'PATCH', {
              ...itemInput(),
              imageUrl: `/api/v1/storage/images/${foreignAsset.id}`,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request(`/menu/items/${itemId}`, 'PATCH', {
              ...itemInput(),
              imageUrl: 'https://attacker.example/x',
            })
          ).status,
          400,
        );
      },
    );
    await t.test('settings persist fees in basis points and restaurant timezone', async () => {
      const settings = {
        name: 'Bếp Nhà kiểm thử',
        address: 'Hồ Chí Minh',
        phone: '0900000000',
        logoUrl: `/api/v1/storage/images/${uploadedId}`,
        timezone: 'Asia/Ho_Chi_Minh',
        serviceChargeBps: 500,
        taxBps: 800,
      };
      assert.equal(
        (await request('/restaurant/settings', 'PATCH', { ...settings, taxBps: 10001 })).status,
        400,
      );
      await json(await request('/restaurant/settings', 'PATCH', settings), 200);
      const current = await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } });
      assert.equal(current.taxBps, 800);
      assert.equal(current.name, settings.name);
    });
    await t.test(
      'QR encodes only public URL; regeneration invalidates old code; active session blocks changes',
      async () => {
        const input = { name: 'Bàn 01', capacity: 4, position: 1, status: 'AVAILABLE' };
        const table = await json<{ id: string; publicCode: string }>(
          await request('/tables', 'POST', input),
        );
        tableId = table.id;
        assert.equal((await request(`/tables/${foreignTable.id}/qr.png`)).status, 404);
        const qr = await request(`/tables/${tableId}/qr.png`);
        assert.equal(qr.status, 200);
        const raw = await sharp(Buffer.from(await qr.arrayBuffer()))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        assert.equal(
          jsQR(new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height)?.data,
          `${config.APP_ORIGIN}/t/${table.publicCode}`,
        );
        const svg = await request(`/tables/${tableId}/qr.svg`);
        assert.equal(svg.status, 200);
        assert.match(await svg.text(), /<svg/);
        const context = await json<Record<string, unknown>>(
          await request(`/public/tables/${table.publicCode}`, 'GET', {}, ''),
          200,
        );
        assert.deepEqual(Object.keys(context).sort(), ['orderingEnabled', 'restaurant', 'table']);
        const regenerated = await json<{ publicCode: string }>(
          await request(`/tables/${tableId}/regenerate-qr`, 'POST'),
          201,
        );
        assert.notEqual(regenerated.publicCode, table.publicCode);
        assert.equal(
          (await request(`/public/tables/${table.publicCode}`, 'GET', {}, '')).status,
          404,
        );
        const session = await db.diningSession.create({
          data: { tableId, restaurantId: restaurant.id },
        });
        for (const [path, method, data] of [
          [`/tables/${tableId}`, 'DELETE', {}],
          [`/tables/${tableId}`, 'PATCH', input],
          [`/tables/${tableId}/regenerate-qr`, 'POST', {}],
        ] as const)
          assert.equal((await request(path, method, data)).status, 409);
        await db.diningSession.delete({ where: { id: session.id } });
        await json(
          await request(`/tables/${tableId}`, 'PATCH', { ...input, status: 'OUT_OF_SERVICE' }),
          200,
        );
        assert.equal(
          (await request(`/public/tables/${regenerated.publicCode}`, 'GET', {}, '')).status,
          404,
        );
        await json(await request(`/tables/${tableId}`, 'DELETE'), 200);
      },
    );
    await t.test(
      'archive guards and concurrent category mutation preserve references; audit commits with changes',
      async () => {
        await json(await request(`/menu/items/${itemId}`, 'DELETE'), 200);
        await json(await request(`/menu/modifiers/${groupId}`, 'DELETE'), 200);
        const responses = await Promise.all([
          request(`/menu/categories/${categoryId}`, 'DELETE'),
          request('/menu/items', 'POST', { ...itemInput(), modifierGroupIds: [] }),
        ]);
        const category = await db.menuCategory.findUniqueOrThrow({ where: { id: categoryId } });
        if (category.archivedAt) {
          assert.equal(responses[0]!.status, 200);
          assert.equal(responses[1]!.status, 400);
        } else {
          assert.equal(responses[0]!.status, 409);
          assert.equal(responses[1]!.status, 201);
        }
        assert.ok(
          await db.menuItem
            .findUniqueOrThrow({ where: { id: itemId } })
            .then((item) => item.archivedAt),
        );
        assert.ok((await db.activityLog.count({ where: { restaurantId: restaurant.id } })) >= 12);
      },
    );
  } finally {
    const ids = restaurants.map((row) => row.id),
      userIds = users.map((row) => row.id);
    const assets = await db.mediaAsset.findMany({ where: { restaurantId: restaurant.id } });
    if (config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY) {
      const s3 = new S3Client({
        endpoint: config.S3_ENDPOINT,
        region: config.S3_REGION,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.S3_ACCESS_KEY_ID,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY,
        },
      });
      try {
        for (const asset of assets)
          await s3.send(
            new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: asset.objectKey }),
          );
      } finally {
        s3.destroy();
      }
    }
    await db.refreshToken.deleteMany({ where: { authSession: { userId: { in: userIds } } } });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.activityLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.mediaAsset.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.menuItemModifierGroup.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.menuItem.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.modifierOption.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.modifierGroup.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.menuCategory.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.diningSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.diningTable.deleteMany({ where: { restaurantId: { in: ids } } });
    await db.staffMembership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.restaurant.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});

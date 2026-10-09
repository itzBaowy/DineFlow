CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE', ADD COLUMN "suspensionReason" VARCHAR(500);
CREATE INDEX "Restaurant_status_createdAt_idx" ON "Restaurant"("status", "createdAt");
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_suspension_reason_check" CHECK (("status" = 'ACTIVE' AND "suspensionReason" IS NULL) OR ("status" = 'SUSPENDED' AND length(trim("suspensionReason")) >= 3 AND "suspensionReason" IS NOT NULL));
CREATE TABLE "PlatformSession" (
  "id" UUID NOT NULL PRIMARY KEY, "userId" UUID NOT NULL, "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL, "revokedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlatformSession_tokenHash_key" ON "PlatformSession"("tokenHash");
CREATE INDEX "PlatformSession_userId_expiresAt_idx" ON "PlatformSession"("userId", "expiresAt");
CREATE TABLE "PlatformSettings" ("id" TEXT NOT NULL PRIMARY KEY, "registrationsEnabled" BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMPTZ(3) NOT NULL);
INSERT INTO "PlatformSettings" ("id", "updatedAt") VALUES ('global', CURRENT_TIMESTAMP);
ALTER TABLE "PlatformSettings" ADD CONSTRAINT "PlatformSettings_singleton_check" CHECK ("id" = 'global');
CREATE TABLE "PlatformAudit" (
  "id" UUID NOT NULL PRIMARY KEY, "actorUserId" UUID NOT NULL, "action" TEXT NOT NULL, "targetId" TEXT, "reason" VARCHAR(500), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PlatformAudit_createdAt_idx" ON "PlatformAudit"("createdAt");

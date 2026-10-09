-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN     "credentialVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PlatformSession" ADD COLUMN     "credentialVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfaVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlatformSettings" ALTER COLUMN "id" SET DEFAULT 'global';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "credentialVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "mfaLastCounter" BIGINT,
ADD COLUMN     "mfaSecret" TEXT,
ADD COLUMN     "requiresEmailVerification" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AccountToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "credentialVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "payload" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "credentialVersion" INTEGER NOT NULL,
    "setupSecret" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountToken_userId_kind_createdAt_idx" ON "AccountToken"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_sentAt_nextAttemptAt_idx" ON "EmailOutbox"("sentAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "MfaChallenge_tokenHash_key" ON "MfaChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "MfaChallenge_userId_expiresAt_idx" ON "MfaChallenge"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_credential_version_check" CHECK ("credentialVersion" >= 0);
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_kind_check" CHECK (kind IN ('VERIFY_EMAIL', 'RESET_PASSWORD'));
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_expiry_check" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_attempts_check" CHECK (attempts BETWEEN 0 AND 5);
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_attempts_check" CHECK (attempts BETWEEN 0 AND 5);
-- Existing password-only platform sessions cannot survive mandatory MFA rollout.
UPDATE "PlatformSession" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;

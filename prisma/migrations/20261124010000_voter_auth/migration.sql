-- CreateTable
CREATE TABLE "VoterSession" (
    "id" UUID NOT NULL,
    "voterId" UUID NOT NULL,
    "credentialFingerprint" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VoterSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoterLoginLimit" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VoterLoginLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "VoterSession_voterId_idx" ON "VoterSession"("voterId");

-- CreateIndex
CREATE INDEX "VoterSession_expiresAt_idx" ON "VoterSession"("expiresAt");

-- CreateIndex
CREATE INDEX "VoterLoginLimit_expiresAt_idx" ON "VoterLoginLimit"("expiresAt");

-- AddForeignKey
ALTER TABLE "VoterSession" ADD CONSTRAINT "VoterSession_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

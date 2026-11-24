ALTER TABLE "Election" ADD COLUMN "primaryColor" TEXT;
ALTER TABLE "Election" ADD CONSTRAINT "Election_primaryColor_check"
  CHECK ("primaryColor" IS NULL OR "primaryColor" ~ '^#[0-9a-fA-F]{6}$');

ALTER TABLE "Restaurant" ADD COLUMN "cashierMaxDiscountBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_cashier_discount_check" CHECK ("cashierMaxDiscountBps" BETWEEN 0 AND 10000);
ALTER TABLE "DiningSession" ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "discountReason" TEXT;
ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_discount_check" CHECK ("discount" >= 0 AND (("discount" = 0 AND "discountReason" IS NULL) OR ("discount" > 0 AND "discountReason" IS NOT NULL AND length(trim("discountReason")) BETWEEN 3 AND 500)));
-- Existing pre-billing records may have no receipt. Every API payment writes all three fields.
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" UUID, ADD COLUMN "requestHash" CHAR(64), ADD COLUMN "receiptSnapshot" JSONB;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receipt_fields_check" CHECK (
  ("idempotencyKey" IS NULL AND "requestHash" IS NULL AND "receiptSnapshot" IS NULL) OR
  ("idempotencyKey" IS NOT NULL AND "requestHash" ~ '^[a-f0-9]{64}$' AND "receiptSnapshot" IS NOT NULL AND jsonb_typeof("receiptSnapshot") = 'object')
);
CREATE FUNCTION dineflow_payment_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Completed payment records are immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Payment_immutable" BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION dineflow_payment_immutable();

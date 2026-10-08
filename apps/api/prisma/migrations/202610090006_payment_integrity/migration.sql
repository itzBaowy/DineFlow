ALTER TABLE "Payment" DROP CONSTRAINT "Payment_receipt_fields_check";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receipt_fields_check" CHECK (
  ("idempotencyKey" IS NULL AND "requestHash" IS NULL AND "receiptSnapshot" IS NULL) OR
  ("idempotencyKey" IS NOT NULL AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[a-f0-9]{64}$' AND "receiptSnapshot" IS NOT NULL AND jsonb_typeof("receiptSnapshot") = 'object')
);
-- New billing payments additionally enforce the same integer rounding as the application.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_fee_rounding_check" CHECK (
  "receiptSnapshot" IS NULL OR (
    "serviceCharge" = (("subtotal"::bigint - "discount") * "serviceChargeBps" + 5000) / 10000 AND
    "tax" = (("subtotal"::bigint - "discount" + "serviceCharge") * "taxBps" + 5000) / 10000
  )
);

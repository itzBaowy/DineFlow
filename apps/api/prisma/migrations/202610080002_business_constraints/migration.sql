-- Prisma cannot express partial indexes or CHECK constraints in its schema.
CREATE UNIQUE INDEX "DiningSession_one_active_per_table"
ON "DiningSession" ("tableId") WHERE "status" IN ('OPEN', 'PAYMENT_REQUESTED');

ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_billing_config_check"
CHECK ("currency" = 'VND' AND "serviceChargeBps" BETWEEN 0 AND 10000 AND "taxBps" BETWEEN 0 AND 10000);
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_capacity_check" CHECK ("capacity" > 0);
ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_closed_at_check"
CHECK (("status" = 'CLOSED' AND "closedAt" IS NOT NULL AND "closedAt" >= "openedAt") OR ("status" <> 'CLOSED' AND "closedAt" IS NULL));
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_expiration_check" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_chronology_check"
CHECK ("expiresAt" > "createdAt" AND ("usedAt" IS NULL OR "usedAt" >= "createdAt"));
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_expiration_check" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_price_check" CHECK ("basePrice" >= 0);
ALTER TABLE "ModifierGroup" ADD CONSTRAINT "ModifierGroup_selections_check"
CHECK ("minSelections" >= 0 AND "maxSelections" >= "minSelections" AND "maxSelections" > 0);
ALTER TABLE "ModifierOption" ADD CONSTRAINT "ModifierOption_price_check" CHECK ("priceDelta" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_amount_check" CHECK ("totalAmount" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_guest_source_check"
CHECK (("source" = 'GUEST' AND "guestSessionId" IS NOT NULL) OR ("source" = 'STAFF' AND "guestSessionId" IS NULL));
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancellation_check"
CHECK ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND length(trim("cancellationReason")) > 0 AND "cancellationReason" IS NOT NULL));
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_amount_check"
CHECK ("quantity" > 0 AND "basePriceSnapshot" >= 0 AND "unitPrice" >= "basePriceSnapshot" AND "totalAmount" = "quantity"::bigint * "unitPrice");
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_price_check" CHECK ("priceDeltaSnapshot" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check"
CHECK ("subtotal" >= 0 AND "discount" BETWEEN 0 AND "subtotal" AND "serviceCharge" >= 0 AND "tax" >= 0
AND "serviceChargeBps" BETWEEN 0 AND 10000 AND "taxBps" BETWEEN 0 AND 10000
AND "total" = "subtotal"::bigint - "discount" + "serviceCharge" + "tax" AND "paidAmount" = "total");

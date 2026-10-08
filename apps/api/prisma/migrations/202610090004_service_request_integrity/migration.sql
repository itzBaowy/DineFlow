-- At most one live request per kind/table session; concurrent guest retries share it.
CREATE UNIQUE INDEX "ServiceRequest_live_type_key" ON "ServiceRequest" ("diningSessionId", "type")
WHERE "status" IN ('PENDING', 'ACKNOWLEDGED');
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_resolved_time_check"
CHECK (("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL) OR ("status" <> 'RESOLVED' AND "resolvedAt" IS NULL));

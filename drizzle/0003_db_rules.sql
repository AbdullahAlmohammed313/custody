CREATE INDEX "op_incoming_pending" ON "operations" USING btree ("to_user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "op_status_created" ON "operations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "op_requester_created" ON "operations" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE INDEX "places_responsible_user" ON "places" USING btree ("responsible_user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_number_unique" UNIQUE("employee_number");--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "op_disposal" CHECK (("operations"."type" = 'disposal') = ("operations"."new_status" = 'disposed'));--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "op_route" CHECK (CASE "operations"."type"
        WHEN 'stock_in' THEN num_nonnulls("operations"."from_user_id", "operations"."from_place_id") = 0 AND "operations"."to_place_id" IS NOT NULL
        WHEN 'delivery' THEN "operations"."from_place_id" IS NOT NULL AND "operations"."to_user_id" IS NOT NULL
        WHEN 'transfer' THEN num_nonnulls("operations"."from_user_id", "operations"."from_place_id") = 1 AND num_nonnulls("operations"."to_user_id", "operations"."to_place_id") = 1
        WHEN 'return' THEN "operations"."from_user_id" IS NOT NULL AND "operations"."to_place_id" IS NOT NULL
        ELSE num_nonnulls("operations"."from_user_id", "operations"."from_place_id", "operations"."to_user_id", "operations"."to_place_id") = 0
      END);
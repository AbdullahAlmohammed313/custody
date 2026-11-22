-- Previously disabled accounts become banned before the column is dropped
UPDATE "users" SET "banned" = true WHERE "is_active" = false;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_active";

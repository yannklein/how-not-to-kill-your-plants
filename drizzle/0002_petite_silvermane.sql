CREATE TYPE "public"."alert_category" AS ENUM('light', 'overwatering', 'underwatering', 'pests', 'nutrients', 'temperature', 'humidity', 'repot', 'other');--> statement-breakpoint
CREATE TYPE "public"."alert_source" AS ENUM('photo', 'pattern');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('open', 'done', 'dismissed');--> statement-breakpoint
ALTER TYPE "public"."ai_feature" ADD VALUE 'health_check';--> statement-breakpoint
CREATE TABLE "gardener_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"source" "alert_source" NOT NULL,
	"category" "alert_category" NOT NULL,
	"texts" jsonb NOT NULL,
	"suggestion" jsonb,
	"photo_id" uuid,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "plant" ADD COLUMN "last_mood_at" timestamp;--> statement-breakpoint
ALTER TABLE "plant" ADD COLUMN "last_pattern_check_on" date;--> statement-breakpoint
ALTER TABLE "gardener_alert" ADD CONSTRAINT "gardener_alert_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gardener_alert" ADD CONSTRAINT "gardener_alert_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gardener_alert" ADD CONSTRAINT "gardener_alert_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gardener_alert_plant_status_idx" ON "gardener_alert" USING btree ("plant_id","status");--> statement-breakpoint
-- Photos that exist before Phase 3 are not health-checked retroactively.
UPDATE "photo" SET "checked_at" = now();

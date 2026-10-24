CREATE TYPE "public"."photo_kind" AS ENUM('plant', 'label');--> statement-breakpoint
ALTER TABLE "feed_event" ADD COLUMN "text_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "home" ADD COLUMN "last_season" text;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "kind" "photo_kind" DEFAULT 'plant' NOT NULL;--> statement-breakpoint
ALTER TABLE "plant" ADD COLUMN "last_mood" text;
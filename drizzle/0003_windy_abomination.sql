CREATE TYPE "public"."tip_kind" AS ENUM('season', 'repot', 'species', 'pattern');--> statement-breakpoint
CREATE TABLE "discover_search" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"input" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"locale" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discover_search_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "tip_kind" NOT NULL,
	"plant_id" uuid,
	"category" "alert_category",
	"trigger_key" text NOT NULL,
	"texts" jsonb,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tip_trigger_key_unique" UNIQUE("trigger_key")
);
--> statement-breakpoint
CREATE TABLE "tip_recipient" (
	"tip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"shown_at" timestamp,
	CONSTRAINT "tip_recipient_tip_id_user_id_pk" PRIMARY KEY("tip_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD COLUMN "scientific_name" text;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD COLUMN "card" jsonb;--> statement-breakpoint
ALTER TABLE "discover_search" ADD CONSTRAINT "discover_search_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip" ADD CONSTRAINT "tip_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_recipient" ADD CONSTRAINT "tip_recipient_tip_id_tip_id_fk" FOREIGN KEY ("tip_id") REFERENCES "public"."tip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_recipient" ADD CONSTRAINT "tip_recipient_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
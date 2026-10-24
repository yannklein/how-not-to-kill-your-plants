CREATE TYPE "public"."ai_feature" AS ENUM('identify', 'care_profile', 'feed_text', 'tips', 'chat', 'discover');--> statement-breakpoint
CREATE TYPE "public"."light_level" AS ENUM('low', 'medium', 'bright_indirect', 'direct');--> statement-breakpoint
CREATE TYPE "public"."plant_status" AS ENUM('alive', 'dead', 'given_away');--> statement-breakpoint
CREATE TYPE "public"."task_outcome" AS ENUM('done', 'still_moist', 'skipped', 'rootbound_yes', 'rootbound_no');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('water', 'settle_check', 'repot', 'fertilize', 'rotate', 'dust', 'mist', 'photo');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature" "ai_feature" NOT NULL,
	"model" text NOT NULL,
	"user_id" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"month" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_token_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "calendar_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "care_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"type" "task_type" NOT NULL,
	"due_on" date NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "care_task_plant_id_type_unique" UNIQUE("plant_id","type")
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plant_id" uuid,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_text" (
	"event_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feed_text_event_id_locale_pk" PRIMARY KEY("event_id","locale")
);
--> statement-breakpoint
CREATE TABLE "group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"group_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_member_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "home" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'Home' NOT NULL,
	"city" text DEFAULT 'Barcelona' NOT NULL,
	"hemisphere" text DEFAULT 'N' NOT NULL,
	"timezone" text DEFAULT 'Europe/Madrid' NOT NULL,
	"ai_monthly_cap_usd" numeric(10, 2) DEFAULT '20' NOT NULL,
	"ai_warned_for_month" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"used_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "moment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"photo_id" uuid,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"object_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"taken_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"spot_id" uuid,
	"species_id" uuid,
	"name" text NOT NULL,
	"persona" jsonb,
	"acquired_on" date NOT NULL,
	"just_bought" boolean DEFAULT true NOT NULL,
	"pot_size_cm" integer,
	"status" "plant_status" DEFAULT 'alive' NOT NULL,
	"water_interval_override_days" integer,
	"cover_photo_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "species" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scientific_name_key" text NOT NULL,
	"scientific_name" text NOT NULL,
	"common_names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"care_profile" jsonb,
	"care_profile_status" text DEFAULT 'pending' NOT NULL,
	"profile_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "species_scientific_name_key_unique" UNIQUE("scientific_name_key")
);
--> statement-breakpoint
CREATE TABLE "spot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"light_level" "light_level" DEFAULT 'medium' NOT NULL,
	"window_direction" text DEFAULT 'none' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_completion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"type" "task_type" NOT NULL,
	"user_id" text NOT NULL,
	"outcome" "task_outcome" NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"locale" text DEFAULT 'en' NOT NULL,
	"push_time" text DEFAULT '08:30' NOT NULL,
	"last_digest_on" date,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"species_id" uuid,
	"name" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_token" ADD CONSTRAINT "calendar_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_task" ADD CONSTRAINT "care_task_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_thread_id_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD CONSTRAINT "chat_thread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD CONSTRAINT "chat_thread_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_event" ADD CONSTRAINT "feed_event_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_text" ADD CONSTRAINT "feed_text_event_id_feed_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."feed_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_used_by_user_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment" ADD CONSTRAINT "moment_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment" ADD CONSTRAINT "moment_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment" ADD CONSTRAINT "moment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant" ADD CONSTRAINT "plant_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant" ADD CONSTRAINT "plant_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant" ADD CONSTRAINT "plant_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completion" ADD CONSTRAINT "task_completion_task_id_care_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."care_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completion" ADD CONSTRAINT "task_completion_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completion" ADD CONSTRAINT "task_completion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_month_idx" ON "ai_usage" USING btree ("month");--> statement-breakpoint
CREATE INDEX "care_task_due_on_idx" ON "care_task" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "chat_message_thread_id_idx" ON "chat_message" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "feed_event_plant_id_idx" ON "feed_event" USING btree ("plant_id");--> statement-breakpoint
CREATE INDEX "photo_plant_id_idx" ON "photo" USING btree ("plant_id");--> statement-breakpoint
CREATE INDEX "plant_group_id_idx" ON "plant" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_completion_plant_id_idx" ON "task_completion" USING btree ("plant_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
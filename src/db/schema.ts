import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const taskType = pgEnum("task_type", [
  "water",
  "settle_check",
  "repot",
  "fertilize",
  "rotate",
  "dust",
  "mist",
  "photo",
]);
export const taskOutcome = pgEnum("task_outcome", [
  "done",
  "still_moist",
  "skipped",
  "rootbound_yes",
  "rootbound_no",
]);
export const plantStatus = pgEnum("plant_status", ["alive", "dead", "given_away"]);
export const photoKind = pgEnum("photo_kind", ["plant", "label"]);
export const lightLevel = pgEnum("light_level", [
  "low",
  "medium",
  "bright_indirect",
  "direct",
]);
export const aiFeature = pgEnum("ai_feature", [
  "identify",
  "care_profile",
  "feed_text",
  "tips",
  "chat",
  "discover",
]);

// ---------------------------------------------------------------------------
// Better Auth core tables (hand-written to match the Drizzle adapter's default
// names; Task 3 reconciles with the Better Auth CLI output).
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  // admin plugin
  role: text("role").$type<"admin" | "user">().default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  // domain fields
  locale: text("locale").$type<"en" | "fr" | "pt-BR">().notNull().default("en"),
  pushTime: text("push_time").notNull().default("08:30"),
  lastDigestOn: date("last_digest_on"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Domain tables
// ---------------------------------------------------------------------------

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at").notNull().defaultNow();

export const home = pgTable("home", {
  id: id(),
  name: text("name").notNull().default("Home"),
  city: text("city").notNull().default("Barcelona"),
  hemisphere: text("hemisphere").$type<"N" | "S">().notNull().default("N"),
  timezone: text("timezone").notNull().default("Europe/Madrid"),
  aiMonthlyCapUsd: numeric("ai_monthly_cap_usd", { precision: 10, scale: 2 })
    .notNull()
    .default("20"),
  aiWarnedForMonth: text("ai_warned_for_month"), // YYYY-MM
  lastSeason: text("last_season"), // season last announced in the feed; null = no baseline yet
  createdAt: createdAt(),
});

export const invite = pgTable("invite", {
  id: id(),
  token: text("token").notNull().unique(), // 32-byte base64url
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  usedBy: text("used_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const group = pgTable("group", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const groupMember = pgTable(
  "group_member",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

export const spot = pgTable("spot", {
  id: id(),
  name: text("name").notNull(),
  lightLevel: lightLevel("light_level").notNull().default("medium"),
  windowDirection: text("window_direction")
    .$type<"N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "none">()
    .notNull()
    .default("none"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export type LocalizedNames = { en?: string; fr?: string; "pt-BR"?: string };

export const species = pgTable("species", {
  id: id(),
  scientificNameKey: text("scientific_name_key").notNull().unique(), // normalized
  scientificName: text("scientific_name").notNull(),
  commonNames: jsonb("common_names").$type<LocalizedNames>().notNull().default({}),
  careProfile: jsonb("care_profile").$type<Record<string, unknown>>(),
  careProfileStatus: text("care_profile_status")
    .$type<"pending" | "ready" | "failed">()
    .notNull()
    .default("pending"),
  profileAttempts: integer("profile_attempts").notNull().default(0),
  createdAt: createdAt(),
});

export type Persona = { summary: string; traits: string[] };

export const plant = pgTable(
  "plant",
  {
    id: id(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "restrict" }),
    spotId: uuid("spot_id").references(() => spot.id, { onDelete: "set null" }),
    speciesId: uuid("species_id").references(() => species.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    persona: jsonb("persona").$type<Persona>(),
    acquiredOn: date("acquired_on").notNull(),
    justBought: boolean("just_bought").notNull().default(true),
    potSizeCm: integer("pot_size_cm"),
    status: plantStatus("status").notNull().default("alive"),
    waterIntervalOverrideDays: integer("water_interval_override_days"),
    coverPhotoId: uuid("cover_photo_id"), // no FK: photo -> plant is circular
    lastMood: text("last_mood"), // mood the feed last saw; null = no baseline yet
    createdAt: createdAt(),
  },
  (t) => [index("plant_group_id_idx").on(t.groupId)],
);

export const careTask = pgTable(
  "care_task",
  {
    id: id(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id, { onDelete: "cascade" }),
    type: taskType("type").notNull(),
    dueOn: date("due_on").notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("care_task_plant_id_type_unique").on(t.plantId, t.type),
    index("care_task_due_on_idx").on(t.dueOn),
  ],
);

export const taskCompletion = pgTable(
  "task_completion",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => careTask.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id, { onDelete: "cascade" }),
    type: taskType("type").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    outcome: taskOutcome("outcome").notNull(),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("task_completion_plant_id_idx").on(t.plantId)],
);

export const photo = pgTable(
  "photo",
  {
    id: id(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    kind: photoKind("kind").notNull().default("plant"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    takenAt: timestamp("taken_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("photo_plant_id_idx").on(t.plantId)],
);

// ---------------------------------------------------------------------------
// Phase 2+ tables (created now, unused in Phase 1)
// ---------------------------------------------------------------------------

export const moment = pgTable("moment", {
  id: id(),
  plantId: uuid("plant_id")
    .notNull()
    .references(() => plant.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // new_leaf | new_growth | flower | repotted
  photoId: uuid("photo_id").references(() => photo.id, { onDelete: "set null" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const feedEvent = pgTable(
  "feed_event",
  {
    id: id(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    textAttempts: integer("text_attempts").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("feed_event_plant_id_idx").on(t.plantId)],
);

export const feedText = pgTable(
  "feed_text",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => feedEvent.id, { onDelete: "cascade" }),
    locale: text("locale").$type<"en" | "fr" | "pt-BR">().notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.locale] })],
);

export const chatThread = pgTable("chat_thread", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  plantId: uuid("plant_id").references(() => plant.id, { onDelete: "set null" }),
  title: text("title"),
  createdAt: createdAt(),
});

export const chatMessage = pgTable(
  "chat_message",
  {
    id: id(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThread.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: jsonb("content").$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("chat_message_thread_id_idx").on(t.threadId)],
);

export const wishlistItem = pgTable("wishlist_item", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  speciesId: uuid("species_id").references(() => species.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Delivery + accounting
// ---------------------------------------------------------------------------

export const pushSubscription = pgTable("push_subscription", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
});

export const calendarToken = pgTable("calendar_token", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    feature: aiFeature("feature").notNull(),
    model: text("model").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    month: text("month").notNull(), // YYYY-MM in home time
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_month_idx").on(t.month)],
);


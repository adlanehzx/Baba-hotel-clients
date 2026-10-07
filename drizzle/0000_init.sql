CREATE TYPE "public"."request_status" AS ENUM('NEW', 'IN_PROGRESS', 'DONE');--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"category" text NOT NULL,
	"message" text,
	"lang" text NOT NULL,
	"status" "request_status" DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_number_unique" UNIQUE("number"),
	CONSTRAINT "rooms_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "requests_status_created_idx" ON "requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "requests_room_created_idx" ON "requests" USING btree ("room_id","created_at");
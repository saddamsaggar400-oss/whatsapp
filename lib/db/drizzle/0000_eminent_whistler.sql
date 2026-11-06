CREATE TABLE "turki_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"body" text NOT NULL,
	"author_name" text DEFAULT 'زائر' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turki_conversations" (
	"visitor_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turki_media_files" (
	"id" text PRIMARY KEY NOT NULL,
	"object_path" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turki_media_files_object_path_unique" UNIQUE("object_path")
);
--> statement-breakpoint
CREATE TABLE "turki_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"visitor_id" text NOT NULL,
	"sender" text DEFAULT 'visitor' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turki_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"copy" text NOT NULL,
	"image_path" text,
	"time_label" text DEFAULT 'الآن' NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turki_comments" ADD CONSTRAINT "turki_comments_post_id_turki_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."turki_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turki_messages" ADD CONSTRAINT "turki_messages_visitor_id_turki_conversations_visitor_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."turki_conversations"("visitor_id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE `chat_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`data` blob,
	`storageKey` text,
	FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `wisal_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`clientId` text NOT NULL,
	`tokenHash` text NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connection_tab` ON `wisal_connections` (`userId`,`clientId`);--> statement-breakpoint
CREATE INDEX `presence_expiry` ON `wisal_connections` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`isGroup` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`visitorId` text,
	FOREIGN KEY (`visitorId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_thread_per_visitor` ON `chat_conversations` (`visitorId`);--> statement-breakpoint
CREATE TABLE `wisal_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` text NOT NULL,
	`conversationId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_recipient` ON `wisal_events` (`userId`,`id`);--> statement-breakpoint
CREATE TABLE `wisal_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_members` (
	`conversationId` text NOT NULL,
	`userId` text NOT NULL,
	`lastReadId` integer DEFAULT 0 NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`hiddenBeforeId` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`conversationId`, `userId`),
	FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `members_user` ON `chat_members` (`userId`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversationId` text NOT NULL,
	`senderId` text NOT NULL,
	`clientId` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`attachmentId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`senderId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attachmentId`) REFERENCES `chat_attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_idempotency` ON `chat_messages` (`senderId`,`clientId`);--> statement-breakpoint
CREATE INDEX `messages_thread` ON `chat_messages` (`conversationId`,`id`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`tokenHash` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_expiry` ON `chat_sessions` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `wisal_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wisal_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`authorId` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#005c4b' NOT NULL,
	`attachmentId` text,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`authorId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attachmentId`) REFERENCES `wisal_uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `status_expiry` ON `wisal_statuses` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `wisal_typing` (
	`conversationId` text NOT NULL,
	`userId` text NOT NULL,
	`expiresAt` integer NOT NULL,
	PRIMARY KEY(`conversationId`, `userId`),
	FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `wisal_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`conversationId` text,
	`purpose` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`storageKey` text NOT NULL,
	`createdAt` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`ownerId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wisal_uploads_storageKey_unique` ON `wisal_uploads` (`storageKey`);--> statement-breakpoint
CREATE TABLE `chat_users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`name` text NOT NULL,
	`password` text DEFAULT '!disabled' NOT NULL,
	`about` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#00a884' NOT NULL,
	`lastSeen` integer DEFAULT 0 NOT NULL,
	`avatarUrl` text DEFAULT '' NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`role` text DEFAULT 'member' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_users_handle_unique` ON `chat_users` (`handle`);
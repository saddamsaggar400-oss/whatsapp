CREATE TABLE `wisal_push_subscriptions` (
	`endpointHash` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`endpoint` text NOT NULL,
	`applicationKey` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastPushAt` integer,
	`lastStatus` integer,
	FOREIGN KEY (`userId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `push_recipient` ON `wisal_push_subscriptions` (`userId`);
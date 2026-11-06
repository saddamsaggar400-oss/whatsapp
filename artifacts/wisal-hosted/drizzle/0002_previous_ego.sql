CREATE TABLE `wisal_message_receipts` (
	`messageId` integer NOT NULL,
	`userId` text NOT NULL,
	`deliveredAt` integer,
	`readAt` integer,
	PRIMARY KEY(`messageId`, `userId`),
	FOREIGN KEY (`messageId`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `chat_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `receipts_recipient` ON `wisal_message_receipts` (`userId`,`messageId`);
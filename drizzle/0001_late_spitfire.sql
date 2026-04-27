CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` enum('replicate','fal_ai','stability_ai') NOT NULL,
	`apiKey` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `game_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`category` enum('romance','adventurous','kinky','roleplay','fantasy','quickie') NOT NULL,
	`spiceLevel` enum('mild','medium','hot','extreme') NOT NULL DEFAULT 'medium',
	`currentPrompt` text,
	`promptHistory` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tool` enum('text_to_image','text_to_video','image_to_video','video_extension','face_swap','virtual_try_on','image_upscale') NOT NULL,
	`gen_provider` enum('replicate','fal_ai','stability_ai') NOT NULL,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`prompt` text,
	`inputParams` json,
	`inputMediaId` int,
	`outputMediaId` int,
	`externalJobId` varchar(255),
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `generations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('image','video') NOT NULL,
	`source` enum('upload','generated') NOT NULL,
	`url` text NOT NULL,
	`fileKey` text NOT NULL,
	`filename` text,
	`mimeType` varchar(128),
	`fileSize` int,
	`width` int,
	`height` int,
	`thumbnailUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`defaultProvider` enum('replicate','fal_ai','stability_ai') NOT NULL DEFAULT 'replicate',
	`defaultSpiceLevel` enum('mild','medium','hot','extreme') NOT NULL DEFAULT 'medium',
	`defaultCategories` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_preferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `ageVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `dateOfBirth` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `bio` text;
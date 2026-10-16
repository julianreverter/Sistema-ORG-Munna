CREATE TABLE `customer_account_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`client_name` text NOT NULL,
	`movement_date` text NOT NULL,
	`movement_type` text NOT NULL,
	`concept` text NOT NULL,
	`signed_amount` real NOT NULL,
	`notes` text,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

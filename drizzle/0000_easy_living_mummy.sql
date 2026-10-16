CREATE TABLE `app_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'operario' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_email_uq` ON `app_users` (`email`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`discounts_json` text DEFAULT '{}' NOT NULL,
	`returnable` integer DEFAULT true NOT NULL,
	`billing_weight` text DEFAULT 'Neto' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dispatch_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dispatch_id` integer NOT NULL,
	`production_unit_id` integer NOT NULL,
	`unique_code` text NOT NULL,
	`product_name` text NOT NULL,
	`weight_kg` real,
	`units` integer,
	`unit_price` real DEFAULT 0 NOT NULL,
	`discount_pct` real DEFAULT 0 NOT NULL,
	`line_total` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`dispatch_id`) REFERENCES `dispatches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_unit_id`) REFERENCES `production_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dispatches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`remittance_number` text NOT NULL,
	`client_id` integer NOT NULL,
	`client_name` text NOT NULL,
	`total_kg` real DEFAULT 0 NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	`discount_total` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'emitido' NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dispatches_remittance_uq` ON `dispatches` (`remittance_number`);--> statement-breakpoint
CREATE TABLE `production_units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unique_code` text NOT NULL,
	`product_code` text NOT NULL,
	`product_name` text NOT NULL,
	`container` text NOT NULL,
	`weight_kg` real,
	`units` integer,
	`responsible` text NOT NULL,
	`family` text NOT NULL,
	`presentation` text NOT NULL,
	`base_price_snapshot` real DEFAULT 0 NOT NULL,
	`cost_per_kg_snapshot` real,
	`status` text DEFAULT 'stock' NOT NULL,
	`lot` text,
	`expires_at` text,
	`created_by_email` text NOT NULL,
	`dispatched_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_units_unique_code_uq` ON `production_units` (`unique_code`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`family` text NOT NULL,
	`presentation` text NOT NULL,
	`container` text NOT NULL,
	`unit_type` text DEFAULT 'kg' NOT NULL,
	`tare_kg` real DEFAULT 0 NOT NULL,
	`base_price` real DEFAULT 0 NOT NULL,
	`ingredients` text DEFAULT '' NOT NULL,
	`allergens` text DEFAULT 'Contiene leche y derivados.' NOT NULL,
	`expiry_days` integer DEFAULT 365 NOT NULL,
	`rne` text,
	`rnpa` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_code_uq` ON `products` (`code`);--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`purchased_product_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`net_package_price` real NOT NULL,
	`vat_rate` real DEFAULT 0 NOT NULL,
	`vat_amount` real DEFAULT 0 NOT NULL,
	`line_total` real DEFAULT 0 NOT NULL,
	`final_cost_per_unit` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchased_product_id`) REFERENCES `purchased_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchased_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`master_name` text NOT NULL,
	`supplier_id` integer NOT NULL,
	`supplier_description` text NOT NULL,
	`cost_unit` text DEFAULT 'kg' NOT NULL,
	`content_per_package` real NOT NULL,
	`vat_rate` real DEFAULT 0 NOT NULL,
	`last_net_package_cost` real,
	`last_final_cost_per_unit` real,
	`last_purchase_at` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_id` integer NOT NULL,
	`invoice_number` text NOT NULL,
	`invoice_date` text NOT NULL,
	`cost_center` text NOT NULL,
	`payment_status` text NOT NULL,
	`net_total` real DEFAULT 0 NOT NULL,
	`vat_total` real DEFAULT 0 NOT NULL,
	`gross_total` real DEFAULT 0 NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipe_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`master_product_name` text NOT NULL,
	`quantity_kg` real NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_code` text NOT NULL,
	`name` text NOT NULL,
	`yield_kg` real NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_product_code_uq` ON `recipes` (`product_code`);--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_id` integer NOT NULL,
	`payment_date` text NOT NULL,
	`amount` real NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`notes` text,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`tax_mode` text DEFAULT 'revisar' NOT NULL,
	`category` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_name_uq` ON `suppliers` (`name`);
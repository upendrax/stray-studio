CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text,
	`recipient_name` text NOT NULL,
	`phone` text NOT NULL,
	`line1` text NOT NULL,
	`line2` text,
	`city` text NOT NULL,
	`postal_code` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `addresses_user_idx` ON `addresses` (`user_id`);--> statement-breakpoint
CREATE TABLE `attribute_values` (
	`id` text PRIMARY KEY NOT NULL,
	`attribute_id` text NOT NULL,
	`value` text NOT NULL,
	`color` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attribute_values_unique_idx` ON `attribute_values` (`attribute_id`,`value`);--> statement-breakpoint
CREATE INDEX `attribute_values_attribute_idx` ON `attribute_values` (`attribute_id`);--> statement-breakpoint
CREATE TABLE `attributes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`use_images` integer DEFAULT false NOT NULL,
	`use_color` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attributes_name_idx` ON `attributes` (`name`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`cover_image_key` text,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`meta_title` text,
	`meta_description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_idx` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discount_categories` (
	`discount_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`discount_id`, `category_id`),
	FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `discount_products` (
	`discount_id` text NOT NULL,
	`product_id` text NOT NULL,
	PRIMARY KEY(`discount_id`, `product_id`),
	FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `discount_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`discount_id` text NOT NULL,
	`order_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `redemptions_discount_email_idx` ON `discount_redemptions` (`discount_id`,`email`);--> statement-breakpoint
CREATE TABLE `discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`type` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`applies` text DEFAULT 'order' NOT NULL,
	`min_type` text DEFAULT 'none' NOT NULL,
	`min_order_amount` integer,
	`min_quantity` integer,
	`max_uses` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`once_per_customer` integer DEFAULT false NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discounts_code_idx` ON `discounts` (`code`);--> statement-breakpoint
CREATE TABLE `option_value_images` (
	`id` text PRIMARY KEY NOT NULL,
	`option_value_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`alt` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`option_value_id`) REFERENCES `product_option_values`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `option_value_images_value_idx` ON `option_value_images` (`option_value_id`);--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`actor_type` text DEFAULT 'system' NOT NULL,
	`actor_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_events_order_idx` ON `order_events` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`variant_id` text,
	`title` text NOT NULL,
	`variant_title` text,
	`sku` text,
	`image_r2_key` text,
	`unit_price` integer NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`ship_name` text NOT NULL,
	`ship_line1` text NOT NULL,
	`ship_line2` text,
	`ship_city` text NOT NULL,
	`ship_postal_code` text,
	`subtotal` integer NOT NULL,
	`discount_amount` integer DEFAULT 0 NOT NULL,
	`discount_code` text,
	`shipping_amount` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`payment_method` text NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`payhere_ref` text,
	`slip_r2_key` text,
	`slip_uploaded_at` integer,
	`slip_reject_reason` text,
	`refund_reference` text,
	`courier_name` text,
	`tracking_number` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_idx` ON `orders` (`number`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `product_categories` (
	`product_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `category_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`alt` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_images_product_idx` ON `product_images` (`product_id`);--> statement-breakpoint
CREATE TABLE `product_option_values` (
	`id` text PRIMARY KEY NOT NULL,
	`option_id` text NOT NULL,
	`attribute_value_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`option_id`) REFERENCES `product_options`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribute_value_id`) REFERENCES `attribute_values`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `option_values_option_idx` ON `product_option_values` (`option_id`);--> statement-breakpoint
CREATE TABLE `product_options` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`attribute_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `product_options_product_idx` ON `product_options` (`product_id`);--> statement-breakpoint
CREATE TABLE `product_tags` (
	`product_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`product_id`, `tag`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`has_options` integer DEFAULT false NOT NULL,
	`base_price` integer DEFAULT 0 NOT NULL,
	`compare_at_price` integer,
	`charge_tax` integer DEFAULT false NOT NULL,
	`cost_per_item` integer,
	`track_inventory` integer DEFAULT true NOT NULL,
	`low_stock_threshold` integer DEFAULT 5 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_idx` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_status_idx` ON `products` (`status`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_invite` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_invite_token_unique` ON `staff_invite` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'customer' NOT NULL,
	`phone` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `variant_option_values` (
	`variant_id` text NOT NULL,
	`option_value_id` text NOT NULL,
	PRIMARY KEY(`variant_id`, `option_value_id`),
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_value_id`) REFERENCES `product_option_values`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`sku` text,
	`price` integer,
	`quantity` integer DEFAULT 0 NOT NULL,
	`available` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `variants` (`product_id`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

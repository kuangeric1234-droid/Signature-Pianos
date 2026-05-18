-- Signature Pianos — Piano table alterations
-- Run this FIRST before inventory_seed.sql

-- Drop old price columns if they exist and start clean
alter table pianos drop column if exists price;
alter table pianos drop column if exists sale_price;

-- Add clean single price field
alter table pianos add column if not exists sale_price numeric not null default 0;

-- Add condition as text (replacing any old enum)
alter table pianos drop column if exists condition;
alter table pianos add column if not exists condition text;

-- Add missing columns
alter table pianos add column if not exists description_short text;
alter table pianos add column if not exists weight_kg numeric;
alter table pianos add column if not exists dimensions_cm jsonb;

-- Slug for clean public URLs (e.g. instruments/yamaha-yu11-6202566).
-- Uniqueness enforced via a unique index — ALTER TABLE ADD CONSTRAINT
-- has no IF NOT EXISTS form, but CREATE UNIQUE INDEX IF NOT EXISTS does.
alter table pianos add column if not exists slug text;
create unique index if not exists pianos_slug_unique on pianos(slug);

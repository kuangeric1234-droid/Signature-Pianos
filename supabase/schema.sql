-- =============================================================================
-- SIGNATURE PIANOS — SUPABASE SCHEMA
-- =============================================================================
-- Run this entire file in the Supabase SQL editor on a FRESH project.
-- It is ordered for top-to-bottom execution:
--   1. Extensions
--   2. Sequences (used by number-generating functions)
--   3. Helper functions that are referenced as column defaults
--   4. Enum types
--   5. Tables (in dependency order: parents before children)
--   6. updated_at + warranty-expiry triggers
--   7. Indexes
--   8. Auth helper functions (is_admin / is_super_admin) — created AFTER
--      admin_users so they can reference it
--   9. Row Level Security (enable + policies)
--  10. Token-based driver-access function
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
-- gen_random_uuid() is built-in in PostgreSQL 13+, but pgcrypto provides
-- gen_random_bytes() which the token generator uses.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================================
-- 2. SEQUENCES
-- =============================================================================
-- One shared sequence per number-prefix; numbers don't reset across years
-- (SP-2026-00050 followed by SP-2027-00051 is intentional).
CREATE SEQUENCE IF NOT EXISTS order_number_seq    START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq  START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS warranty_number_seq START 1 INCREMENT 1;


-- =============================================================================
-- 3. HELPER FUNCTIONS (defaults / triggers)
-- =============================================================================
-- These must exist BEFORE the tables that reference them as defaults.
-- SECURITY DEFINER on the number generators so they bypass the caller's
-- USAGE privilege on the sequences (callers don't need direct sequence access).

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'SP-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('order_number_seq')::text, 5, '0');
$$;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'INV-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('invoice_number_seq')::text, 5, '0');
$$;

CREATE OR REPLACE FUNCTION generate_warranty_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'WRT-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('warranty_number_seq')::text, 5, '0');
$$;

-- 24 random bytes → exactly 32 base64 chars (no padding), then converted to
-- URL-safe alphabet (RFC 4648 §5).
CREATE OR REPLACE FUNCTION generate_token()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;

-- Generic trigger to bump updated_at on UPDATE. Attached to every table below.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Keep warranties.expiry_date in sync with (start_date + years).
-- date + interval returns timestamp; cast back to date for assignment.
CREATE OR REPLACE FUNCTION compute_warranty_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.expiry_date = (NEW.start_date + (NEW.years || ' years')::interval)::date;
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 4. ENUMS
-- =============================================================================
-- Wrapped in DO blocks so the schema is safely re-runnable: a duplicate_object
-- error on the second run is swallowed without aborting the transaction.

DO $$ BEGIN CREATE TYPE piano_type            AS ENUM ('acoustic_upright', 'acoustic_grand', 'digital'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE piano_condition       AS ENUM ('excellent', 'good', 'fair');                     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE piano_stock_status    AS ENUM ('available', 'reserved', 'sold');                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE order_status          AS ENUM ('pending', 'confirmed', 'paid', 'delivering', 'delivered', 'complete', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE delivery_status       AS ENUM ('scheduled', 'pickup_pending', 'picked_up', 'in_transit', 'delivered', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE warranty_status       AS ENUM ('active', 'expired', 'void');                     EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE tuner_booking_status  AS ENUM ('pending', 'confirmed', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE viewing_time          AS ENUM ('morning', 'afternoon', 'late_afternoon');        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE how_heard_source      AS ENUM ('google', 'instagram', 'facebook', 'word_of_mouth', 'drove_past', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE viewing_status        AS ENUM ('pending', 'confirmed', 'cancelled', 'completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE teacher_tier          AS ENUM ('listing_only', 'full_saas');                     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE listing_status        AS ENUM ('active', 'paused', 'hidden');                    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lesson_type           AS ENUM ('in_person', 'online');                            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE teacher_booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE student_level         AS ENUM ('beginner', 'intermediate', 'advanced');          EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE admin_role            AS ENUM ('super_admin', 'admin', 'staff');                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- 5. TABLES
-- =============================================================================
-- Order chosen to satisfy FK dependencies on a single top-to-bottom run.

-- ----- customers --------------------------------------------------------------
-- user_id is nullable so the same table can hold both registered account
-- holders AND walk-in / form-only customers (viewing bookings, etc.).
CREATE TABLE IF NOT EXISTS customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  email       text NOT NULL UNIQUE,
  phone       text,
  address     text,
  suburb      text,
  state       text,
  postcode    text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ----- pianos -----------------------------------------------------------------
-- Note: column originally named `unique` in the spec was renamed to `is_unique`
-- because `unique` is a reserved Postgres keyword that would force quoting on
-- every query.
CREATE TABLE IF NOT EXISTS pianos (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                     piano_type NOT NULL,
  condition                piano_condition,
  brand                    text NOT NULL,
  model                    text,
  year                     integer,
  serial_number            text,
  colour                   text,
  finish                   text,
  price                    numeric(10, 2) NOT NULL,
  sale_price               numeric(10, 2),
  currency                 text NOT NULL DEFAULT 'AUD',
  stock_status             piano_stock_status NOT NULL DEFAULT 'available',
  is_unique                boolean NOT NULL DEFAULT false,
  requires_delivery_flow   boolean NOT NULL DEFAULT true,
  requires_tuner_booking   boolean NOT NULL DEFAULT true,
  warranty_years           integer NOT NULL DEFAULT 10,
  finance_eligible         boolean NOT NULL DEFAULT false,
  manufacturer_warranty    boolean NOT NULL DEFAULT false,
  description              text,
  internal_notes           text,
  weight_kg                numeric(6, 2),
  dimensions_cm            text,
  images                   text[] NOT NULL DEFAULT '{}',
  featured                 boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ----- orders -----------------------------------------------------------------
-- customer_id and piano_id use SET NULL: deleting a customer or piano keeps
-- the historical sales record intact but severs the link. The columns must
-- be nullable for SET NULL to be legal.
CREATE TABLE IF NOT EXISTS orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid REFERENCES customers(id) ON DELETE SET NULL,
  piano_id          uuid REFERENCES pianos(id)    ON DELETE SET NULL,
  order_number      text NOT NULL UNIQUE DEFAULT generate_order_number(),
  status            order_status NOT NULL DEFAULT 'pending',
  subtotal          numeric(10, 2) NOT NULL,
  discount          numeric(10, 2) NOT NULL DEFAULT 0,
  total             numeric(10, 2) NOT NULL,
  currency          text NOT NULL DEFAULT 'AUD',
  payment_method    text,
  payment_reference text,
  invoice_number    text NOT NULL UNIQUE DEFAULT generate_invoice_number(),
  invoice_sent      boolean NOT NULL DEFAULT false,
  invoice_sent_at   timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ----- deliveries -------------------------------------------------------------
-- Cascades from order: deleting an order removes its delivery record.
-- Tokens are URL-safe random 32-char strings, generated automatically.
CREATE TABLE IF NOT EXISTS deliveries (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_name                 text,
  driver_phone                text,
  scheduled_date              date,
  scheduled_time_window       text,
  status                      delivery_status NOT NULL DEFAULT 'scheduled',
  pickup_photos               text[] NOT NULL DEFAULT '{}',
  delivery_photos             text[] NOT NULL DEFAULT '{}',
  pickup_confirmed_at         timestamptz,
  delivered_at                timestamptz,
  pickup_link_token           text NOT NULL UNIQUE DEFAULT generate_token(),
  delivery_link_token         text NOT NULL UNIQUE DEFAULT generate_token(),
  customer_notified_pickup    boolean NOT NULL DEFAULT false,
  customer_notified_delivery  boolean NOT NULL DEFAULT false,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ----- warranties -------------------------------------------------------------
-- expiry_date is auto-computed by a trigger (= start_date + years).
-- customer_id and piano_id use SET NULL for the same reason as orders.
CREATE TABLE IF NOT EXISTS warranties (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid NOT NULL REFERENCES orders(id)    ON DELETE CASCADE,
  customer_id          uuid REFERENCES customers(id) ON DELETE SET NULL,
  piano_id             uuid REFERENCES pianos(id)    ON DELETE SET NULL,
  warranty_number      text NOT NULL UNIQUE DEFAULT generate_warranty_number(),
  start_date           date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date          date,
  years                integer NOT NULL DEFAULT 10,
  certificate_sent     boolean NOT NULL DEFAULT false,
  certificate_sent_at  timestamptz,
  certificate_url      text,
  status               warranty_status NOT NULL DEFAULT 'active',
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ----- tuner_bookings ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS tuner_bookings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid NOT NULL REFERENCES orders(id)     ON DELETE CASCADE,
  customer_id          uuid REFERENCES customers(id)           ON DELETE SET NULL,
  warranty_id          uuid REFERENCES warranties(id)          ON DELETE CASCADE,
  tuner_name           text,
  tuner_phone          text,
  tuner_email          text,
  scheduled_date       date,
  scheduled_time       time,
  status               tuner_booking_status NOT NULL DEFAULT 'pending',
  auto_booked          boolean NOT NULL DEFAULT true,
  confirmation_sent    boolean NOT NULL DEFAULT false,
  completion_notes     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ----- viewing_bookings -------------------------------------------------------
-- customer_id is nullable + SET NULL: a viewing booking can be standalone
-- and later linked to a customer if they convert.
CREATE TABLE IF NOT EXISTS viewing_bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  email               text NOT NULL,
  phone               text,
  preferred_date      date,
  preferred_time      viewing_time,
  pianos_interested   text[] NOT NULL DEFAULT '{}',
  how_heard           how_heard_source,
  message             text,
  status              viewing_status NOT NULL DEFAULT 'pending',
  notified            boolean NOT NULL DEFAULT false,
  converted_to_sale   boolean NOT NULL DEFAULT false,
  customer_id         uuid REFERENCES customers(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ----- teachers ---------------------------------------------------------------
-- user_id is nullable so admins can create listing-only profiles before the
-- teacher signs up. When the teacher creates an account, link via update.
CREATE TABLE IF NOT EXISTS teachers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name            text NOT NULL,
  last_name             text NOT NULL,
  email                 text NOT NULL UNIQUE,
  phone                 text,
  bio                   text,
  profile_photo_url     text,
  suburb                text,
  state                 text,
  postcode              text,
  years_experience      integer,
  qualifications        text[] NOT NULL DEFAULT '{}',
  specialties           text[] NOT NULL DEFAULT '{}',
  teaches_children      boolean NOT NULL DEFAULT true,
  teaches_adults        boolean NOT NULL DEFAULT true,
  teaches_online        boolean NOT NULL DEFAULT false,
  teaches_in_person     boolean NOT NULL DEFAULT true,
  studio_address        text,
  tier                  teacher_tier NOT NULL DEFAULT 'listing_only',
  listing_active        boolean NOT NULL DEFAULT true,
  verified              boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ----- teacher_listings -------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_listings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id                uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  headline                  text NOT NULL,
  description               text,
  hourly_rate               numeric(8, 2),
  trial_lesson_available    boolean NOT NULL DEFAULT false,
  trial_lesson_rate         numeric(8, 2),
  lesson_duration_minutes   integer[] NOT NULL DEFAULT '{30,45,60}',
  languages                 text[] NOT NULL DEFAULT '{English}',
  images                    text[] NOT NULL DEFAULT '{}',
  slug                      text NOT NULL UNIQUE,
  views                     integer NOT NULL DEFAULT 0,
  status                    listing_status NOT NULL DEFAULT 'active',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ----- teacher_bookings -------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id          uuid NOT NULL REFERENCES teachers(id)         ON DELETE CASCADE,
  listing_id          uuid NOT NULL REFERENCES teacher_listings(id) ON DELETE CASCADE,
  student_name        text NOT NULL,
  student_email       text NOT NULL,
  student_phone       text,
  lesson_date         date,
  lesson_time         time,
  duration_minutes    integer,
  lesson_type         lesson_type,
  rate                numeric(8, 2),
  status              teacher_booking_status NOT NULL DEFAULT 'pending',
  notes               text,
  teacher_notified    boolean NOT NULL DEFAULT false,
  student_notified    boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ----- teacher_students -------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_students (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id                uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  first_name                text NOT NULL,
  last_name                 text NOT NULL,
  email                     text,
  phone                     text,
  parent_name               text,
  parent_phone              text,
  date_of_birth             date,
  level                     student_level,
  lesson_day                text,
  lesson_time               time,
  lesson_duration_minutes   integer,
  rate_per_lesson           numeric(8, 2),
  active                    boolean NOT NULL DEFAULT true,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ----- teacher_invoices -------------------------------------------------------
-- Shares the same INV-YYYY-XXXXX sequence as orders.invoice_number so a
-- single namespace covers every invoice the business produces.
CREATE TABLE IF NOT EXISTS teacher_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      uuid NOT NULL REFERENCES teachers(id)         ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES teacher_students(id) ON DELETE CASCADE,
  invoice_number  text NOT NULL UNIQUE DEFAULT generate_invoice_number(),
  amount          numeric(10, 2) NOT NULL,
  currency        text NOT NULL DEFAULT 'AUD',
  due_date        date,
  paid            boolean NOT NULL DEFAULT false,
  paid_at         timestamptz,
  sent            boolean NOT NULL DEFAULT false,
  sent_at         timestamptz,
  line_items      jsonb NOT NULL DEFAULT '[]',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ----- admin_users ------------------------------------------------------------
-- user_id is nullable so seed/test data and bootstrap rows can be inserted
-- before a real auth.users row exists. In production, every active admin
-- must have user_id set or is_admin() will not recognise them.
CREATE TABLE IF NOT EXISTS admin_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  email       text NOT NULL UNIQUE,
  role        admin_role NOT NULL DEFAULT 'staff',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- 6. TRIGGERS
-- =============================================================================

-- One updated_at trigger per table. Guarded with DROP IF EXISTS so the file
-- is safely re-runnable.
DROP TRIGGER IF EXISTS trg_set_updated_at ON customers;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON pianos;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON pianos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON orders;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON deliveries;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON warranties;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON warranties FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON tuner_bookings;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON tuner_bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON viewing_bookings;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON viewing_bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON teachers;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON teacher_listings;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON teacher_listings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON teacher_bookings;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON teacher_bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON teacher_students;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON teacher_students FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON teacher_invoices;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON teacher_invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON admin_users;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Warranty expiry auto-compute (BEFORE INSERT and UPDATE so a years change
-- recomputes the expiry).
DROP TRIGGER IF EXISTS trg_compute_warranty_expiry ON warranties;
CREATE TRIGGER trg_compute_warranty_expiry
  BEFORE INSERT OR UPDATE ON warranties
  FOR EACH ROW EXECUTE FUNCTION compute_warranty_expiry();


-- =============================================================================
-- 7. INDEXES
-- =============================================================================
-- UNIQUE constraints already create implicit indexes (customers.email,
-- pianos.serial_number when unique, orders.order_number, orders.invoice_number,
-- warranties.warranty_number, deliveries.pickup_link_token,
-- deliveries.delivery_link_token, teachers.email, teacher_listings.slug,
-- teacher_invoices.invoice_number, admin_users.email). The indexes below
-- cover the remaining hot paths: foreign keys, status filters, sort orders.

-- Foreign-key indexes (Postgres does NOT auto-index FK columns)
CREATE INDEX IF NOT EXISTS idx_orders_customer_id            ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_piano_id               ON orders(piano_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id           ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_warranties_order_id           ON warranties(order_id);
CREATE INDEX IF NOT EXISTS idx_warranties_customer_id        ON warranties(customer_id);
CREATE INDEX IF NOT EXISTS idx_warranties_piano_id           ON warranties(piano_id);
CREATE INDEX IF NOT EXISTS idx_tuner_bookings_order_id       ON tuner_bookings(order_id);
CREATE INDEX IF NOT EXISTS idx_tuner_bookings_customer_id    ON tuner_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_tuner_bookings_warranty_id    ON tuner_bookings(warranty_id);
CREATE INDEX IF NOT EXISTS idx_viewing_bookings_customer_id  ON viewing_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id              ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_listings_teacher_id   ON teacher_listings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_bookings_teacher_id   ON teacher_bookings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_bookings_listing_id   ON teacher_bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_teacher_students_teacher_id   ON teacher_students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_invoices_teacher_id   ON teacher_invoices(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_invoices_student_id   ON teacher_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id           ON admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id             ON customers(user_id);

-- Status filters (frequent WHERE clauses in admin dashboards / customer views)
CREATE INDEX IF NOT EXISTS idx_pianos_stock_status           ON pianos(stock_status);
CREATE INDEX IF NOT EXISTS idx_pianos_type                   ON pianos(type);
CREATE INDEX IF NOT EXISTS idx_pianos_featured               ON pianos(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_orders_status                 ON orders(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_status             ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_warranties_status             ON warranties(status);
CREATE INDEX IF NOT EXISTS idx_tuner_bookings_status         ON tuner_bookings(status);
CREATE INDEX IF NOT EXISTS idx_viewing_bookings_status       ON viewing_bookings(status);
CREATE INDEX IF NOT EXISTS idx_teacher_listings_status       ON teacher_listings(status);
CREATE INDEX IF NOT EXISTS idx_teacher_bookings_status       ON teacher_bookings(status);
CREATE INDEX IF NOT EXISTS idx_teachers_listing_active       ON teachers(listing_active) WHERE listing_active = true;
CREATE INDEX IF NOT EXISTS idx_teachers_verified             ON teachers(verified) WHERE verified = true;

-- Sort orders (newest first is the default everywhere)
CREATE INDEX IF NOT EXISTS idx_customers_created_at          ON customers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pianos_created_at             ON pianos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at             ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_created_at         ON deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranties_created_at         ON warranties(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tuner_bookings_created_at     ON tuner_bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_viewing_bookings_created_at   ON viewing_bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teachers_created_at           ON teachers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_listings_created_at   ON teacher_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_bookings_created_at   ON teacher_bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_students_created_at   ON teacher_students(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_invoices_created_at   ON teacher_invoices(created_at DESC);


-- =============================================================================
-- 8. AUTH HELPER FUNCTIONS
-- =============================================================================
-- Created AFTER admin_users exists so they can reference it. Both are
-- SECURITY DEFINER so they bypass RLS on admin_users (otherwise the
-- "only super_admin can read admin_users" policy would prevent every other
-- admin policy from working).

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid()
      AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid()
      AND active = true
      AND role = 'super_admin'
  );
$$;


-- =============================================================================
-- 9. ROW LEVEL SECURITY
-- =============================================================================
-- Strategy:
--   * Every table has RLS enabled.
--   * "Admin full access" policies use is_admin() (super_admin / admin / staff
--     are all admins for data access; super_admin gates only admin_users
--     mutations).
--   * Customer-facing tables match auth.uid() against customers.user_id
--     (or teachers.user_id, etc.).
--   * Public-facing reads (pianos, teacher listings, verified teachers) use
--     anon-permissive policies on a column-status filter.
--   * Insert-only public flows (viewing_bookings) get a permissive INSERT
--     policy and no SELECT for anon.

-- Enable RLS on every table
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pianos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranties         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuner_bookings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewing_bookings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_listings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_bookings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_students   ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_invoices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users        ENABLE ROW LEVEL SECURITY;

-- ----- customers --------------------------------------------------------------
DROP POLICY IF EXISTS "customers self select" ON customers;
CREATE POLICY "customers self select" ON customers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "customers self update" ON customers;
CREATE POLICY "customers self update" ON customers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "customers self insert" ON customers;
CREATE POLICY "customers self insert" ON customers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "customers admin all" ON customers;
CREATE POLICY "customers admin all" ON customers
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- pianos -----------------------------------------------------------------
DROP POLICY IF EXISTS "pianos public read available" ON pianos;
CREATE POLICY "pianos public read available" ON pianos
  FOR SELECT
  USING (stock_status = 'available');

DROP POLICY IF EXISTS "pianos admin all" ON pianos;
CREATE POLICY "pianos admin all" ON pianos
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- orders -----------------------------------------------------------------
DROP POLICY IF EXISTS "orders customer read own" ON orders;
CREATE POLICY "orders customer read own" ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = orders.customer_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "orders admin all" ON orders;
CREATE POLICY "orders admin all" ON orders
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- deliveries -------------------------------------------------------------
-- Customer can SELECT their own delivery (joined through order → customer).
DROP POLICY IF EXISTS "deliveries customer read own" ON deliveries;
CREATE POLICY "deliveries customer read own" ON deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.id = deliveries.order_id
        AND c.user_id = auth.uid()
    )
  );

-- Driver / public token access. The actual security boundary is the secrecy
-- of the random token, NOT the RLS policy — the app MUST always include a
-- WHERE filter on pickup_link_token or delivery_link_token. For a safer
-- pattern, see get_delivery_by_token() at the bottom of this file, which
-- exposes a single function-level entry point.
DROP POLICY IF EXISTS "deliveries anon read by token" ON deliveries;
CREATE POLICY "deliveries anon read by token" ON deliveries
  FOR SELECT TO anon
  USING (
    pickup_link_token IS NOT NULL
    OR delivery_link_token IS NOT NULL
  );

DROP POLICY IF EXISTS "deliveries admin all" ON deliveries;
CREATE POLICY "deliveries admin all" ON deliveries
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- warranties -------------------------------------------------------------
DROP POLICY IF EXISTS "warranties customer read own" ON warranties;
CREATE POLICY "warranties customer read own" ON warranties
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = warranties.customer_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "warranties admin all" ON warranties;
CREATE POLICY "warranties admin all" ON warranties
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- tuner_bookings ---------------------------------------------------------
DROP POLICY IF EXISTS "tuner_bookings customer read own" ON tuner_bookings;
CREATE POLICY "tuner_bookings customer read own" ON tuner_bookings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = tuner_bookings.customer_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tuner_bookings admin all" ON tuner_bookings;
CREATE POLICY "tuner_bookings admin all" ON tuner_bookings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- viewing_bookings -------------------------------------------------------
-- Public form submission: anon can INSERT, but cannot read existing rows.
DROP POLICY IF EXISTS "viewing_bookings anon insert" ON viewing_bookings;
CREATE POLICY "viewing_bookings anon insert" ON viewing_bookings
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "viewing_bookings admin all" ON viewing_bookings;
CREATE POLICY "viewing_bookings admin all" ON viewing_bookings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- teachers ---------------------------------------------------------------
-- Public read of verified, active teachers (for the find-a-teacher directory).
DROP POLICY IF EXISTS "teachers public read verified" ON teachers;
CREATE POLICY "teachers public read verified" ON teachers
  FOR SELECT
  USING (verified = true AND listing_active = true);

DROP POLICY IF EXISTS "teachers self select" ON teachers;
CREATE POLICY "teachers self select" ON teachers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "teachers self update" ON teachers;
CREATE POLICY "teachers self update" ON teachers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "teachers self insert" ON teachers;
CREATE POLICY "teachers self insert" ON teachers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "teachers admin all" ON teachers;
CREATE POLICY "teachers admin all" ON teachers
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- teacher_listings -------------------------------------------------------
DROP POLICY IF EXISTS "teacher_listings public read active" ON teacher_listings;
CREATE POLICY "teacher_listings public read active" ON teacher_listings
  FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "teacher_listings teacher manage own" ON teacher_listings;
CREATE POLICY "teacher_listings teacher manage own" ON teacher_listings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_listings.teacher_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_listings.teacher_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "teacher_listings admin all" ON teacher_listings;
CREATE POLICY "teacher_listings admin all" ON teacher_listings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- teacher_bookings -------------------------------------------------------
-- Teachers see bookings for their listings.
DROP POLICY IF EXISTS "teacher_bookings teacher read own" ON teacher_bookings;
CREATE POLICY "teacher_bookings teacher read own" ON teacher_bookings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_bookings.teacher_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "teacher_bookings teacher update own" ON teacher_bookings;
CREATE POLICY "teacher_bookings teacher update own" ON teacher_bookings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_bookings.teacher_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_bookings.teacher_id
        AND t.user_id = auth.uid()
    )
  );

-- Students who booked (i.e. authenticated users whose JWT email matches the
-- student_email on the booking) can read their own row.
DROP POLICY IF EXISTS "teacher_bookings student read own" ON teacher_bookings;
CREATE POLICY "teacher_bookings student read own" ON teacher_bookings
  FOR SELECT TO authenticated
  USING (student_email = (auth.jwt() ->> 'email'));

-- Public can INSERT a booking (the find-a-teacher booking form is open).
DROP POLICY IF EXISTS "teacher_bookings public insert" ON teacher_bookings;
CREATE POLICY "teacher_bookings public insert" ON teacher_bookings
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "teacher_bookings admin all" ON teacher_bookings;
CREATE POLICY "teacher_bookings admin all" ON teacher_bookings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- teacher_students -------------------------------------------------------
DROP POLICY IF EXISTS "teacher_students teacher manage own" ON teacher_students;
CREATE POLICY "teacher_students teacher manage own" ON teacher_students
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_students.teacher_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_students.teacher_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "teacher_students admin all" ON teacher_students;
CREATE POLICY "teacher_students admin all" ON teacher_students
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- teacher_invoices -------------------------------------------------------
DROP POLICY IF EXISTS "teacher_invoices teacher manage own" ON teacher_invoices;
CREATE POLICY "teacher_invoices teacher manage own" ON teacher_invoices
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_invoices.teacher_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_invoices.teacher_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "teacher_invoices admin all" ON teacher_invoices;
CREATE POLICY "teacher_invoices admin all" ON teacher_invoices
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ----- admin_users ------------------------------------------------------------
-- Only super_admin can read or mutate the admin_users table.
-- (is_admin() bypasses this via SECURITY DEFINER, so other admin policies
-- elsewhere still work for staff/admin roles.)
DROP POLICY IF EXISTS "admin_users super admin all" ON admin_users;
CREATE POLICY "admin_users super admin all" ON admin_users
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- =============================================================================
-- 10. TOKEN-BASED DRIVER ACCESS
-- =============================================================================
-- Recommended access pattern for the driver flow. The driver app calls
-- get_delivery_by_token('xxxx') instead of querying the deliveries table
-- directly. The function runs as the schema owner (SECURITY DEFINER) so it
-- bypasses RLS, but it can only return rows whose token matches the input —
-- the function itself is the access boundary.

CREATE OR REPLACE FUNCTION get_delivery_by_token(token text)
RETURNS SETOF deliveries
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM deliveries
  WHERE pickup_link_token = token
     OR delivery_link_token = token
  LIMIT 1;
$$;

-- Make the function callable by anonymous (unauthenticated) drivers.
GRANT EXECUTE ON FUNCTION get_delivery_by_token(text) TO anon, authenticated;

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================

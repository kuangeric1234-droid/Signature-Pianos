-- =============================================================================
-- SIGNATURE PIANOS — MISSING TABLES
-- =============================================================================
-- The live Supabase database already contains:
--     - viewing_bookings  (defined in schema.sql)
--     - service_requests  (created out-of-band; not in schema.sql)
--
-- This file creates the remaining 12 tables from schema.sql plus every
-- prerequisite they need to insert / update cleanly. It's designed to run
-- top-to-bottom in a single execution in the Supabase SQL editor, AND to be
-- safely re-runnable: every object uses an idempotent pattern
-- (IF NOT EXISTS, OR REPLACE, DO-block-with-EXCEPTION, DROP-then-CREATE).
--
-- What's intentionally skipped:
--   - CREATE TABLE viewing_bookings + its triggers / indexes / policies
--   - The viewing-only enums (viewing_time, how_heard_source, viewing_status)
--   - service_requests entirely (it's not in schema.sql)
--
-- Execution order (matches schema.sql):
--   1. Extensions
--   2. Sequences (used by number-generating functions)
--   3. Helper functions (referenced as column defaults and triggers)
--   4. Enums
--   5. Tables (parents before children)
--   6. Triggers (updated_at + warranty expiry)
--   7. Indexes
--   8. Auth helper functions (is_admin / is_super_admin — after admin_users)
--   9. RLS (enable + policies)
--  10. Token-based driver-access function
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
-- pgcrypto provides gen_random_bytes() used by generate_token().
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================================
-- 2. SEQUENCES
-- =============================================================================
CREATE SEQUENCE IF NOT EXISTS order_number_seq    START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq  START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS warranty_number_seq START 1 INCREMENT 1;


-- =============================================================================
-- 3. HELPER FUNCTIONS
-- =============================================================================
-- All CREATE OR REPLACE so re-running is a no-op.

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

-- 24 random bytes → 32 base64 chars → URL-safe alphabet.
-- search_path includes `extensions` because Supabase installs pgcrypto there.
CREATE OR REPLACE FUNCTION generate_token()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

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
-- Skipped: viewing_time / how_heard_source / viewing_status — those already
-- exist because viewing_bookings is using them in the live DB.

DO $$ BEGIN CREATE TYPE piano_type            AS ENUM ('acoustic_upright', 'acoustic_grand', 'digital'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE piano_condition       AS ENUM ('excellent', 'good', 'fair');                     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE piano_stock_status    AS ENUM ('available', 'reserved', 'sold');                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE order_status          AS ENUM ('pending', 'confirmed', 'paid', 'delivering', 'delivered', 'complete', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE delivery_status       AS ENUM ('scheduled', 'pickup_pending', 'picked_up', 'in_transit', 'delivered', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE warranty_status       AS ENUM ('active', 'expired', 'void');                     EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE tuner_booking_status  AS ENUM ('pending', 'confirmed', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE teacher_tier          AS ENUM ('listing_only', 'full_saas');                     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE listing_status        AS ENUM ('active', 'paused', 'hidden');                    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lesson_type           AS ENUM ('in_person', 'online');                            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE teacher_booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE student_level         AS ENUM ('beginner', 'intermediate', 'advanced');          EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE admin_role            AS ENUM ('super_admin', 'admin', 'staff');                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- 5. TABLES
-- =============================================================================
-- Order chosen to satisfy FK dependencies in one top-to-bottom run.

-- ----- customers --------------------------------------------------------------
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

-- ----- teachers ---------------------------------------------------------------
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

-- Warranty expiry auto-compute (recomputes on INSERT or UPDATE).
DROP TRIGGER IF EXISTS trg_compute_warranty_expiry ON warranties;
CREATE TRIGGER trg_compute_warranty_expiry
  BEFORE INSERT OR UPDATE ON warranties
  FOR EACH ROW EXECUTE FUNCTION compute_warranty_expiry();


-- =============================================================================
-- 7. INDEXES
-- =============================================================================

-- Foreign-key indexes
CREATE INDEX IF NOT EXISTS idx_orders_customer_id            ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_piano_id               ON orders(piano_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id           ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_warranties_order_id           ON warranties(order_id);
CREATE INDEX IF NOT EXISTS idx_warranties_customer_id        ON warranties(customer_id);
CREATE INDEX IF NOT EXISTS idx_warranties_piano_id           ON warranties(piano_id);
CREATE INDEX IF NOT EXISTS idx_tuner_bookings_order_id       ON tuner_bookings(order_id);
CREATE INDEX IF NOT EXISTS idx_tuner_bookings_customer_id    ON tuner_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_tuner_bookings_warranty_id    ON tuner_bookings(warranty_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id              ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_listings_teacher_id   ON teacher_listings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_bookings_teacher_id   ON teacher_bookings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_bookings_listing_id   ON teacher_bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_teacher_students_teacher_id   ON teacher_students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_invoices_teacher_id   ON teacher_invoices(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_invoices_student_id   ON teacher_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id           ON admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id             ON customers(user_id);

-- Status filters
CREATE INDEX IF NOT EXISTS idx_pianos_stock_status           ON pianos(stock_status);
CREATE INDEX IF NOT EXISTS idx_pianos_type                   ON pianos(type);
CREATE INDEX IF NOT EXISTS idx_pianos_featured               ON pianos(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_orders_status                 ON orders(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_status             ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_warranties_status             ON warranties(status);
CREATE INDEX IF NOT EXISTS idx_tuner_bookings_status         ON tuner_bookings(status);
CREATE INDEX IF NOT EXISTS idx_teacher_listings_status       ON teacher_listings(status);
CREATE INDEX IF NOT EXISTS idx_teacher_bookings_status       ON teacher_bookings(status);
CREATE INDEX IF NOT EXISTS idx_teachers_listing_active       ON teachers(listing_active) WHERE listing_active = true;
CREATE INDEX IF NOT EXISTS idx_teachers_verified             ON teachers(verified) WHERE verified = true;

-- Sort orders (newest first)
CREATE INDEX IF NOT EXISTS idx_customers_created_at          ON customers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pianos_created_at             ON pianos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at             ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_created_at         ON deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranties_created_at         ON warranties(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tuner_bookings_created_at     ON tuner_bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teachers_created_at           ON teachers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_listings_created_at   ON teacher_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_bookings_created_at   ON teacher_bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_students_created_at   ON teacher_students(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_invoices_created_at   ON teacher_invoices(created_at DESC);


-- =============================================================================
-- 8. AUTH HELPER FUNCTIONS
-- =============================================================================
-- Created AFTER admin_users so they can reference it. Both are SECURITY DEFINER
-- so they bypass RLS on admin_users.

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

-- Enable RLS on every missing table
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pianos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranties         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuner_bookings     ENABLE ROW LEVEL SECURITY;
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

-- Anon-by-token: actual security is the secrecy of the token; the app MUST
-- always filter on pickup_link_token or delivery_link_token. Prefer
-- get_delivery_by_token() (see section 10) over reading the table directly.
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

-- ----- teachers ---------------------------------------------------------------
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

DROP POLICY IF EXISTS "teacher_bookings student read own" ON teacher_bookings;
CREATE POLICY "teacher_bookings student read own" ON teacher_bookings
  FOR SELECT TO authenticated
  USING (student_email = (auth.jwt() ->> 'email'));

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
-- Only super_admin can read or mutate admin_users.
DROP POLICY IF EXISTS "admin_users super admin all" ON admin_users;
CREATE POLICY "admin_users super admin all" ON admin_users
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- =============================================================================
-- 10. TOKEN-BASED DRIVER ACCESS
-- =============================================================================
-- Drivers call get_delivery_by_token('xxxx') from the anon role. The function
-- is the security boundary — only the matching row is returned.

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

GRANT EXECUTE ON FUNCTION get_delivery_by_token(text) TO anon, authenticated;

-- =============================================================================
-- END OF MISSING TABLES
-- =============================================================================

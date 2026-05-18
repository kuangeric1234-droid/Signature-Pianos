# Supabase — Signature Pianos schema

The complete database for the Signature Pianos platform: piano inventory, customer orders, delivery + warranty + tuner pipeline, viewing bookings, and the teacher marketplace (both listing-only and full-SaaS tiers).

Two SQL files in this folder:

| File | What it does |
|---|---|
| `schema.sql` | Every enum, table, index, trigger, RLS policy and helper function. Idempotent on rerun (guarded with `IF NOT EXISTS` and `DROP IF EXISTS`). |
| `seed.sql` | Realistic sample data for local dev: 3 customers, 5 pianos, 2 orders with full downstream flow, 2 viewing bookings, 3 teachers, 1 admin. |

---

## Running it

### 1. Apply the schema

In the Supabase dashboard:

1. Open the project → **SQL editor** → **New query**.
2. Paste the entire contents of `schema.sql`.
3. Hit **Run**.

It should complete cleanly on a fresh project. If you're rerunning on an existing project, the `IF NOT EXISTS` / `DROP IF EXISTS` guards mean it won't error, but it also won't reset data — to reset, drop the schema first:

```sql
-- Nuclear option (development only — wipes everything)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

### 2. Apply the seed data

After `schema.sql` has run successfully:

1. **SQL editor** → **New query**.
2. Paste the entire contents of `seed.sql`.
3. Hit **Run**.

The seed is **not** idempotent — re-running will fail on unique constraints (email, `serial_number`, `order_number`, etc.). To re-seed, drop and recreate the schema first (see above) or `TRUNCATE` the relevant tables.

---

## Tables

| Table | Purpose | Key relationships |
|---|---|---|
| `customers` | Every person who buys a piano, books a viewing, or creates an account. `user_id` links to `auth.users` for authenticated customers (nullable for walk-ins). | One-to-many → `orders`, `warranties`, `tuner_bookings`, `viewing_bookings`. |
| `pianos` | Full inventory: used Japanese acoustic + digital + future dealership stock. | One-to-many → `orders`, `warranties`. |
| `orders` | Every piano sale. Auto-numbered `SP-YYYY-XXXXX`, invoice auto-numbered `INV-YYYY-XXXXX`. | Belongs to `customers` (SET NULL) + `pianos` (SET NULL) — historical sales survive customer/piano deletion. Parent of `deliveries`, `warranties`, `tuner_bookings`. |
| `deliveries` | End-to-end delivery tracking incl. pickup/delivery photos and the two unguessable driver-link tokens. | Belongs to `orders` (CASCADE). |
| `warranties` | Auto-generated post-delivery. `expiry_date` is computed by trigger as `start_date + years`. Default `years = 10`. | Belongs to `orders` (CASCADE) + `customers` (SET NULL) + `pianos` (SET NULL). |
| `tuner_bookings` | Auto-created when the warranty is generated, 3–4 weeks out. | Belongs to `orders` (CASCADE) + `customers` (SET NULL) + `warranties` (CASCADE). |
| `viewing_bookings` | Showroom-visit form submissions. `customer_id` is nullable + SET NULL — a viewing can stand alone or link to a customer who later converts. | Optionally belongs to `customers` (SET NULL). |
| `teachers` | Every teacher on the platform — covers both listing-only and full SaaS tiers. `user_id` nullable so admins can pre-create listings. | One-to-many → `teacher_listings`, `teacher_bookings`, `teacher_students`, `teacher_invoices`. |
| `teacher_listings` | The public profile card shown on the find-a-teacher directory. | Belongs to `teachers` (CASCADE). |
| `teacher_bookings` | Student lesson requests made through the marketplace. | Belongs to `teachers` (CASCADE) + `teacher_listings` (CASCADE). |
| `teacher_students` | Full-SaaS-tier feature: a teacher's complete roster. | Belongs to `teachers` (CASCADE). |
| `teacher_invoices` | Full-SaaS-tier feature: invoices teachers send their students. Shares the `INV-YYYY-XXXXX` namespace with order invoices. | Belongs to `teachers` (CASCADE) + `teacher_students` (CASCADE). |
| `admin_users` | Your internal team. Separate from customer and teacher auth. Role drives admin-panel permissions. | Belongs to `auth.users` (nullable for seed; required in production). |

### Schema deviations from the spec

A few small renames / additions that were necessary or much friendlier in practice. Each is annotated in `schema.sql`:

- **`pianos."unique"` → `pianos.is_unique`** — `unique` is a reserved Postgres keyword. Renaming avoids forcing every query to quote it.
- **`customers.user_id` added (nullable)** — the spec's customer RLS policy ("authenticated users can read and update their own row") requires a link from a customer row back to an auth account. The spec didn't list this column but the policy can't work without it.
- **`teachers.user_id` and `admin_users.user_id` made nullable** — lets admins create listing-only teacher profiles before the teacher signs up, and lets the seed file run without first creating `auth.users` rows.
- **`how_heard` enum renamed `how_heard_source`** — avoids name collision with the column of the same name.
- **`warranties.expiry_date`** — auto-computed via `BEFORE INSERT/UPDATE` trigger as `start_date + years` so the two never drift apart.

---

## Environment variables

Your app needs these to connect:

```bash
# Public — safe to expose in the browser
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJI...   # anon key from Project Settings → API

# Server-only — NEVER expose in client code
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...   # service role key from same screen

# Business email for transactional notifications
BUSINESS_EMAIL=info@signaturepianos.com.au
```

| Variable | Where to use it |
|---|---|
| `SUPABASE_URL` | Both client and server. Browser-safe. |
| `SUPABASE_ANON_KEY` | Browser client (`@supabase/supabase-js`). RLS enforces what anon and authenticated users can do. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only routes (admin actions, system jobs, anything that needs to bypass RLS). **Never** ship this to the browser. |
| `BUSINESS_EMAIL` | "From" address (or reply-to) for transactional emails — order confirmations, warranty certificates, viewing-booking notifications, tuner confirmations. |

---

## The driver-link token system

When a delivery is created, the row gets two random URL-safe 32-character tokens generated by `generate_token()`:

- `pickup_link_token` — the URL the driver visits at the warehouse to upload pickup photos and confirm the piano has left.
- `delivery_link_token` — the URL the driver visits at the customer's home to upload delivery photos and mark delivered.

The driver isn't authenticated. The token IS the credential. Two layers protect access:

### Layer 1 — the recommended one: `get_delivery_by_token(token text)`

A SECURITY DEFINER function exposed to the `anon` role:

```sql
SELECT * FROM get_delivery_by_token('the-token-from-the-url');
```

The function runs as the schema owner (RLS bypassed) but can only return rows whose token matches the input — the function body itself is the access boundary. Use this from the driver app.

### Layer 2 — the RLS escape hatch the spec asked for

There's also an `anon SELECT` policy on `deliveries` with `USING (pickup_link_token IS NOT NULL OR delivery_link_token IS NOT NULL)`. This effectively allows `anon` to query the table directly, with the understanding that the app must always include a token in the WHERE clause:

```sql
SELECT * FROM deliveries WHERE pickup_link_token = $1;
```

Without the WHERE filter, this policy would return every delivery — so **token secrecy is the actual security boundary**, not the RLS policy. Prefer Layer 1 (the function) unless you have a reason to query directly.

### Rotating a token

If a token is ever leaked (driver shares the URL, phone screenshot lost, etc.):

```sql
UPDATE deliveries
SET pickup_link_token = generate_token()    -- or delivery_link_token
WHERE id = '...';
```

The old URL stops working immediately.

---

## Row Level Security — what's public, what's locked down

RLS is enabled on every table. The matrix:

| Table | Public (anon) | Authenticated user | Admin |
|---|---|---|---|
| `customers` | — | Read/update own row only | Full |
| `pianos` | Read `stock_status = 'available'` | Read available | Full |
| `orders` | — | Read own (linked via `customers.user_id`) | Full |
| `deliveries` | **Read via token** (see above) | Read own | Full |
| `warranties` | — | Read own | Full |
| `tuner_bookings` | — | Read own | Full |
| `viewing_bookings` | **INSERT only** (form submissions) | INSERT only | Full |
| `teachers` | Read `verified = true AND listing_active = true` | Read/update own | Full |
| `teacher_listings` | Read `status = 'active'` | Manage own (via `teachers.user_id`) | Full |
| `teacher_bookings` | **INSERT only** (booking form) | Teachers see bookings on their listings. Students see bookings where `student_email = JWT email`. | Full |
| `teacher_students` | — | Teachers manage their own students | Full |
| `teacher_invoices` | — | Teachers manage their own invoices | Full |
| `admin_users` | — | — | **Only `super_admin`** |

### Publicly accessible without auth

Three things anyone on the open internet can do:

1. **Read available pianos** — needed for the public catalogue at `/instruments`.
2. **Read active teacher listings + verified teachers** — needed for the find-a-teacher directory at `/teachers`.
3. **Submit a viewing booking** — needed for the public form at `/services/book-a-viewing`.
4. **Submit a teacher booking** — needed for the public booking form on a teacher's profile.
5. **Look up a delivery by token** — needed for the driver-link flow described above.

Everything else requires either an authenticated user or admin role.

### `is_admin()` and `is_super_admin()` notes

Both helper functions are `SECURITY DEFINER`, which means they bypass RLS when they query `admin_users`. This is deliberate: the `admin_users` table itself is locked to `super_admin` only, so without `SECURITY DEFINER` the function would always return `false` for staff/admin users and every other admin policy would break.

### Adding the first real admin

The seed creates a placeholder `admin_users` row with `user_id` NULL — it doesn't grant anyone admin access. To make a real human into an admin:

1. They sign up via Supabase auth (email/password, magic link, OAuth, however you've configured it).
2. Find their `auth.users.id` (e.g. from the **Authentication** tab in the dashboard).
3. Update the seeded row, or insert a new one:

   ```sql
   UPDATE admin_users
   SET user_id = '<their auth.users.id>'
   WHERE email = 'info@signaturepianos.com.au';
   ```

4. From now on, `is_admin()` and `is_super_admin()` will recognise them in any SQL that runs in their session.

---

## Helper functions reference

| Function | Returns | Use |
|---|---|---|
| `generate_order_number()` | `SP-YYYY-XXXXX` | Default on `orders.order_number`. Backed by `order_number_seq`. |
| `generate_invoice_number()` | `INV-YYYY-XXXXX` | Default on `orders.invoice_number` AND `teacher_invoices.invoice_number` — single namespace covering every invoice the business produces. Backed by `invoice_number_seq`. |
| `generate_warranty_number()` | `WRT-YYYY-XXXXX` | Default on `warranties.warranty_number`. Backed by `warranty_number_seq`. |
| `generate_token()` | 32-char URL-safe random string | Default on `deliveries.pickup_link_token` and `deliveries.delivery_link_token`. Also callable directly to rotate a token. |
| `set_updated_at()` | trigger | Attached to every table — bumps `updated_at` on UPDATE. |
| `compute_warranty_expiry()` | trigger | Attached to `warranties` — keeps `expiry_date = start_date + years`. |
| `is_admin()` | boolean | True when the calling auth user is an active row in `admin_users` (any role). |
| `is_super_admin()` | boolean | True only when the calling auth user has `role = 'super_admin'`. |
| `get_delivery_by_token(text)` | `SETOF deliveries` | Driver-flow access. Callable by `anon`. |

### Sequence number cap

The number formats use 5-digit zero-padding, so each prefix caps at **99999** rows before the format breaks (you'd get `SP-2026-100000`). That's room for ~99k orders, ~99k invoices, ~99k warranties — comfortable for a long time. If you ever approach the cap, widen the `lpad(..., 5, '0')` calls in the three `generate_*_number()` functions to `6` or `7`.

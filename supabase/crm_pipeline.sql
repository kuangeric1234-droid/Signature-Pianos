-- =============================================================================
-- SIGNATURE PIANOS — SALES PIPELINE (admin/pipeline.html)
-- =============================================================================
-- Run after leads.sql. Safe to re-run: every object is created idempotently.
--
-- Turns `leads` into the pipeline: one row per person, a stage, what they're
-- looking for, a next step with a due date, and a timeline in `lead_events`.
--
-- Stages: new -> contacted -> visit_booked -> visited -> deciding -> won | lost
--
-- The database moves people along on its own, whichever way the activity
-- arrives (website form, admin page, Stripe webhook):
--   viewing requested or booked            -> Visit booked
--   viewing marked completed               -> Visited
--   payment plan started                   -> Deciding
--   plan signed / deposit paid / an order  -> Won (value = the sale)
--   order cancelled or voided              -> back to Deciding
--   call, text or email logged on a New lead -> Contacted
-- Automatic moves only go forward, and Won always wins. Someone marked Lost who
-- books a viewing is reopened. People are matched by email, then by the last
-- nine digits of their phone, so a walk-in who later books online is one card.
--
-- Every automatic write is wrapped so a CRM problem can never block the
-- booking, order or payment that set it off; it only logs a warning.
--
-- `status` (new/contacted/visited/purchased/closed) is kept in step with
-- `stage` for anything that still reads it.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----- 1. The pipeline columns on leads ---------------------------------------
ALTER TABLE leads ALTER COLUMN email DROP NOT NULL;   -- a walk-in may leave only a phone number

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS stage             text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS stage_changed_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sources           text[] NOT NULL DEFAULT '{}',   -- every way they've reached us
  ADD COLUMN IF NOT EXISTS interest_type     text,          -- upright | grand | digital | not_sure
  ADD COLUMN IF NOT EXISTS budget            text,          -- under_5k | 5_10k | 10_20k | 20k_plus | not_sure
  ADD COLUMN IF NOT EXISTS timeframe         text,          -- asap | 1_3_months | 3_6_months | researching
  ADD COLUMN IF NOT EXISTS player            text,          -- child | adult_beginner | returning | advanced | teacher
  ADD COLUMN IF NOT EXISTS piano_interest    text,          -- the pianos they asked about
  ADD COLUMN IF NOT EXISTS value             numeric(10, 2),-- expected sale; the sale itself once won
  ADD COLUMN IF NOT EXISTS next_action       text,
  ADD COLUMN IF NOT EXISTS next_action_at    timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_auto  boolean NOT NULL DEFAULT true,  -- false once a person sets it
  ADD COLUMN IF NOT EXISTS visit_date        date,
  ADD COLUMN IF NOT EXISTS visit_time        text,
  ADD COLUMN IF NOT EXISTS first_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lost_reason       text,
  ADD COLUMN IF NOT EXISTS won_at            timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at           timestamptz,
  ADD COLUMN IF NOT EXISTS customer_id       uuid REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_id          uuid REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS followup_token    text,          -- lets the guide page save their answers, nothing else
  ADD COLUMN IF NOT EXISTS phone_key         text GENERATED ALWAYS AS
    (nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9), '')) STORED;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE leads ADD CONSTRAINT leads_stage_check
  CHECK (stage IN ('new', 'contacted', 'visit_booked', 'visited', 'deciding', 'won', 'lost'));
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_contact_check;
ALTER TABLE leads ADD CONSTRAINT leads_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL);

-- Existing rows: carry the old follow-up status across once.
UPDATE leads SET
  stage = CASE status WHEN 'contacted' THEN 'contacted' WHEN 'visited' THEN 'visited'
                      WHEN 'purchased' THEN 'won' WHEN 'closed' THEN 'lost' ELSE 'new' END,
  sources = ARRAY[source]
WHERE sources = '{}';

-- One card per person: unique by email now, not by email and source.
DROP INDEX IF EXISTS uq_leads_email_source;
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_email ON leads (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phone_key ON leads (phone_key) WHERE phone_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads (stage, stage_changed_at DESC);

-- ----- 2. The timeline ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type        text NOT NULL,   -- guide | details | viewing | visit | no_show | plan | order | order_cancelled
                               -- | stage | call | sms | email | voicemail | meeting | note | added
  title       text NOT NULL,
  detail      text,
  auto        boolean NOT NULL DEFAULT false,   -- written by the system, not a person
  ref_table   text,            -- the booking, order or plan it came from
  ref_id      uuid,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()   -- exact time, so events in one transaction keep their order
);
ALTER TABLE lead_events ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events (lead_id, created_at DESC);
-- The same booking or order can't log the same event twice (retries, re-runs).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_events_ref ON lead_events (ref_table, ref_id, type) WHERE ref_id IS NOT NULL;

ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access — lead_events" ON lead_events;
CREATE POLICY "Admin full access — lead_events"
  ON lead_events FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ----- 3. Helpers ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm_stage_rank(s text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'visit_booked' THEN 3
                WHEN 'visited' THEN 4 WHEN 'deciding' THEN 5 WHEN 'won' THEN 6 ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION crm_stage_label(s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s WHEN 'new' THEN 'New' WHEN 'contacted' THEN 'Contacted' WHEN 'visit_booked' THEN 'Visit booked'
                WHEN 'visited' THEN 'Visited' WHEN 'deciding' THEN 'Deciding' WHEN 'won' THEN 'Won'
                WHEN 'lost' THEN 'Lost' ELSE s END
$$;

-- ----- 4. Stage bookkeeping on every insert and update ----------------------------
-- Keeps status in step, stamps won/lost dates, and gives every open lead a
-- next step: a suggested one per stage, until a person writes their own.
CREATE OR REPLACE FUNCTION crm_leads_before() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  moved boolean := true;
  visit_moved boolean := false;
  due timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    moved := NEW.stage IS DISTINCT FROM OLD.stage;
    visit_moved := NEW.visit_date IS DISTINCT FROM OLD.visit_date;
  END IF;
  IF NEW.sources IS NULL OR NEW.sources = '{}' THEN NEW.sources := ARRAY[NEW.source]; END IF;

  NEW.status := CASE NEW.stage WHEN 'new' THEN 'new' WHEN 'contacted' THEN 'contacted'
                  WHEN 'visit_booked' THEN 'contacted' WHEN 'visited' THEN 'visited'
                  WHEN 'deciding' THEN 'visited' WHEN 'won' THEN 'purchased' ELSE 'closed' END;

  IF moved THEN
    NEW.stage_changed_at := now();
    NEW.last_activity_at := now();
    IF NEW.stage = 'won' THEN NEW.won_at := coalesce(NEW.won_at, now()); ELSE NEW.won_at := NULL; END IF;
    IF NEW.stage = 'lost' THEN NEW.lost_at := coalesce(NEW.lost_at, now());
    ELSE NEW.lost_at := NULL; NEW.lost_reason := NULL; END IF;
  END IF;

  IF NEW.stage IN ('won', 'lost') THEN
    IF moved THEN NEW.next_action := NULL; NEW.next_action_at := NULL; NEW.next_action_auto := true; END IF;
  ELSIF (moved OR visit_moved) AND (NEW.next_action_auto OR NEW.next_action IS NULL) THEN
    due := CASE NEW.stage
      WHEN 'new'          THEN now()
      WHEN 'contacted'    THEN now() + interval '2 days'
      WHEN 'visit_booked' THEN CASE WHEN NEW.visit_date IS NOT NULL
                                    THEN greatest(now(), ((NEW.visit_date - 1)::timestamp + time '09:00') AT TIME ZONE 'Australia/Melbourne')
                                    ELSE now() + interval '1 day' END
      WHEN 'visited'      THEN now() + interval '1 day'
      WHEN 'deciding'     THEN now() + interval '3 days'
    END;
    NEW.next_action := CASE NEW.stage
      WHEN 'new'          THEN 'Call or text to say hello'
      WHEN 'contacted'    THEN 'Invite them in to play'
      WHEN 'visit_booked' THEN 'Confirm their visit the day before'
      WHEN 'visited'      THEN 'Follow up on the pianos they played'
      WHEN 'deciding'     THEN 'Check in on their decision'
    END;
    NEW.next_action_at := due;
    NEW.next_action_auto := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_crm_leads_before ON leads;
CREATE TRIGGER trg_crm_leads_before BEFORE INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION crm_leads_before();

-- A stage change goes on the timeline, marked automatic when the system made it.
CREATE OR REPLACE FUNCTION crm_leads_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO lead_events (lead_id, type, title, detail, auto)
    VALUES (NEW.id, 'stage', 'Moved to ' || crm_stage_label(NEW.stage),
            CASE WHEN NEW.stage = 'lost' THEN NEW.lost_reason END,
            coalesce(current_setting('crm.auto', true), '') = 'on');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'crm_leads_after: %', SQLERRM;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_crm_leads_after ON leads;
CREATE TRIGGER trg_crm_leads_after AFTER UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION crm_leads_after();

-- ----- 5. The one door everything comes through --------------------------------
-- Finds the person (email, then phone), creates them if new, moves them forward
-- to p_stage if that's further along, and logs the event. Returns the lead id.
-- p_extra may carry value, customer_id, order_id, visit_date, visit_time,
-- piano_interest; a key that's present overwrites, one that's absent leaves it.
CREATE OR REPLACE FUNCTION crm_touch_lead(
  p_email text, p_phone text, p_first text, p_last text,
  p_source text, p_stage text,
  p_event_type text, p_event_title text, p_event_detail text,
  p_ref_table text, p_ref_id uuid,
  p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_key   text := nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9), '');
  v_lead  leads%ROWTYPE;
  v_stage text;
  v_existing uuid;
BEGIN
  IF v_email IS NULL AND v_key IS NULL THEN RETURN NULL; END IF;

  IF p_ref_id IS NOT NULL THEN
    SELECT lead_id INTO v_existing FROM lead_events
     WHERE ref_table = p_ref_table AND ref_id = p_ref_id AND type = p_event_type;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE lower(email) = v_email;
  END IF;
  IF v_lead.id IS NULL AND v_key IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE phone_key = v_key
     AND (email IS NULL OR v_email IS NULL) ORDER BY last_activity_at DESC LIMIT 1;
  END IF;

  PERFORM set_config('crm.auto', 'on', true);

  IF v_lead.id IS NULL THEN
    INSERT INTO leads (source, sources, first_name, last_name, email, phone, stage,
                       value, customer_id, order_id, visit_date, visit_time, piano_interest)
    VALUES (p_source, ARRAY[p_source],
            coalesce(nullif(trim(p_first), ''), 'Unknown'), nullif(trim(p_last), ''),
            v_email, nullif(trim(p_phone), ''), coalesce(p_stage, 'new'),
            (p_extra->>'value')::numeric, (p_extra->>'customer_id')::uuid, (p_extra->>'order_id')::uuid,
            (p_extra->>'visit_date')::date, p_extra->>'visit_time', p_extra->>'piano_interest')
    RETURNING * INTO v_lead;
  ELSE
    v_stage := v_lead.stage;
    IF p_stage IS NOT NULL THEN
      IF p_stage = 'won' THEN v_stage := 'won';
      ELSIF v_lead.stage = 'lost' THEN v_stage := p_stage;              -- they came back: reopen
      ELSIF v_lead.stage <> 'won' AND crm_stage_rank(p_stage) > crm_stage_rank(v_lead.stage) THEN
        v_stage := p_stage;
      END IF;
    END IF;

    UPDATE leads SET
      stage          = v_stage,
      sources        = CASE WHEN p_source = ANY (sources) THEN sources ELSE sources || p_source END,
      first_name     = CASE WHEN first_name = 'Unknown' THEN coalesce(nullif(trim(p_first), ''), first_name) ELSE first_name END,
      last_name      = coalesce(last_name, nullif(trim(p_last), '')),
      email          = coalesce(email, v_email),
      phone          = coalesce(phone, nullif(trim(p_phone), '')),
      value          = CASE WHEN p_extra ? 'value' THEN (p_extra->>'value')::numeric ELSE value END,
      customer_id    = CASE WHEN p_extra ? 'customer_id' THEN (p_extra->>'customer_id')::uuid ELSE customer_id END,
      order_id       = CASE WHEN p_extra ? 'order_id' THEN (p_extra->>'order_id')::uuid ELSE order_id END,
      visit_date     = CASE WHEN p_extra ? 'visit_date' THEN (p_extra->>'visit_date')::date ELSE visit_date END,
      visit_time     = CASE WHEN p_extra ? 'visit_time' THEN p_extra->>'visit_time' ELSE visit_time END,
      piano_interest = coalesce(nullif(p_extra->>'piano_interest', ''), piano_interest),
      last_activity_at = now()
    WHERE id = v_lead.id
    RETURNING * INTO v_lead;
  END IF;

  PERFORM set_config('crm.auto', 'off', true);

  INSERT INTO lead_events (lead_id, type, title, detail, auto, ref_table, ref_id)
  VALUES (v_lead.id, p_event_type, p_event_title, nullif(p_event_detail, ''), true, p_ref_table, p_ref_id)
  ON CONFLICT DO NOTHING;

  RETURN v_lead.id;
END $$;

-- Only the triggers below call it; nobody can call it over the API.
REVOKE ALL ON FUNCTION crm_touch_lead(text, text, text, text, text, text, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ----- 6. Contact logged by hand -> Contacted; guide asked for again -> reopened --
CREATE OR REPLACE FUNCTION crm_events_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type IN ('call', 'sms', 'email', 'voicemail', 'meeting') THEN
    PERFORM set_config('crm.auto', 'on', true);
    UPDATE leads SET
      stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END,
      first_contacted_at = coalesce(first_contacted_at, NEW.created_at),
      last_contacted_at = NEW.created_at,
      last_activity_at = now()
    WHERE id = NEW.lead_id;
    PERFORM set_config('crm.auto', 'off', true);
  ELSIF NEW.type = 'guide' THEN
    -- Someone marked Lost who comes back for the guide is worth another look
    PERFORM set_config('crm.auto', 'on', true);
    UPDATE leads SET stage = CASE WHEN stage = 'lost' THEN 'new' ELSE stage END, last_activity_at = now()
    WHERE id = NEW.lead_id;
    PERFORM set_config('crm.auto', 'off', true);
  ELSIF NOT NEW.auto THEN
    UPDATE leads SET last_activity_at = now() WHERE id = NEW.lead_id;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'crm_events_after: %', SQLERRM;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_crm_events_after ON lead_events;
CREATE TRIGGER trg_crm_events_after AFTER INSERT ON lead_events
  FOR EACH ROW EXECUTE FUNCTION crm_events_after();

-- ----- 7. Viewing requests from the website (viewing_bookings) -----------------
CREATE OR REPLACE FUNCTION crm_from_viewing_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  when_text text := concat_ws(', ', to_char(NEW.preferred_date, 'FMDay FMDD Mon'), replace(NEW.preferred_time, '_', ' '));
  pianos text := array_to_string(NEW.pianos_interested, ', ');
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM crm_touch_lead(NEW.email, NEW.phone, NEW.first_name, NEW.last_name,
      'viewing_request', 'visit_booked', 'viewing', 'Asked to visit the showroom',
      concat_ws('. ', nullif(when_text, ''), CASE WHEN pianos <> '' THEN 'Pianos: ' || pianos END, nullif(NEW.message, '')),
      'viewing_bookings', NEW.id,
      jsonb_strip_nulls(jsonb_build_object('visit_date', NEW.preferred_date, 'visit_time', NEW.preferred_time,
                                           'piano_interest', nullif(pianos, ''))));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM crm_touch_lead(NEW.email, NEW.phone, NEW.first_name, NEW.last_name,
        'viewing_request', 'visit_booked', 'visit_confirmed', 'Visit confirmed', when_text, 'viewing_bookings', NEW.id);
    ELSIF NEW.status = 'completed' THEN
      PERFORM crm_touch_lead(NEW.email, NEW.phone, NEW.first_name, NEW.last_name,
        'viewing_request', 'visited', 'visit', 'Visited the showroom', pianos, 'viewing_bookings', NEW.id);
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM crm_touch_lead(NEW.email, NEW.phone, NEW.first_name, NEW.last_name,
        'viewing_request', NULL, 'visit_cancelled', 'Visit cancelled', when_text, 'viewing_bookings', NEW.id);
    END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'crm_from_viewing_booking: %', SQLERRM;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_crm_viewing_bookings ON viewing_bookings;
CREATE TRIGGER trg_crm_viewing_bookings AFTER INSERT OR UPDATE OF status ON viewing_bookings
  FOR EACH ROW EXECUTE FUNCTION crm_from_viewing_booking();

-- ----- 8. Viewings booked in the admin (viewing_appointments) ------------------
CREATE OR REPLACE FUNCTION crm_from_viewing_appointment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  when_text text := concat_ws(', ', to_char(NEW.appointment_date, 'FMDay FMDD Mon'), NEW.appointment_time);
  src text := coalesce(nullif(NEW.source, ''), 'admin');
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM crm_touch_lead(NEW.email, NEW.phone, NEW.first_name, NEW.last_name,
      src, 'visit_booked', 'viewing', 'Visit booked', concat_ws('. ', when_text, nullif(NEW.notes, '')),
      'viewing_appointments', NEW.id,
      jsonb_strip_nulls(jsonb_build_object('visit_date', NEW.appointment_date, 'visit_time', NEW.appointment_time,
                                           'customer_id', NEW.customer_id)));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'completed' THEN
      PERFORM crm_touch_lead(NEW.email, NEW.phone, NEW.first_name, NEW.last_name,
        src, 'visited', 'visit', 'Visited the showroom', when_text, 'viewing_appointments', NEW.id);
    ELSIF NEW.status = 'no_show' THEN
      PERFORM crm_touch_lead(NEW.email, NEW.phone, NEW.first_name, NEW.last_name,
        src, NULL, 'no_show', 'Didn''t make it to their visit', when_text, 'viewing_appointments', NEW.id);
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM crm_touch_lead(NEW.email, NEW.phone, NEW.first_name, NEW.last_name,
        src, NULL, 'visit_cancelled', 'Visit cancelled', when_text, 'viewing_appointments', NEW.id);
    END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'crm_from_viewing_appointment: %', SQLERRM;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_crm_viewing_appointments ON viewing_appointments;
CREATE TRIGGER trg_crm_viewing_appointments AFTER INSERT OR UPDATE OF status ON viewing_appointments
  FOR EACH ROW EXECUTE FUNCTION crm_from_viewing_appointment();

-- ----- 9. Orders (POS, Stripe checkout, deposits) -------------------------------
-- A live order, deposit or full payment, is a win. Cancelling or voiding the
-- order that won the lead puts them back in Deciding.
CREATE OR REPLACE FUNCTION crm_from_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c customers%ROWTYPE;
  piano text;
  live boolean := NOT coalesce(NEW.voided, false) AND NEW.status::text <> 'cancelled';
  was_live boolean := false;
  new_win boolean := true;   -- an order that has just become live, or changed hands
BEGIN
  IF TG_OP = 'UPDATE' THEN
    was_live := NOT coalesce(OLD.voided, false) AND OLD.status::text <> 'cancelled';
    new_win := NOT was_live OR OLD.customer_id IS DISTINCT FROM NEW.customer_id;
  END IF;
  IF NEW.customer_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO c FROM customers WHERE id = NEW.customer_id;
  IF c.id IS NULL THEN RETURN NULL; END IF;
  SELECT nullif(concat_ws(' ', brand, model, CASE WHEN year IS NOT NULL THEN '(' || year || ')' END), '')
    INTO piano FROM pianos WHERE id = NEW.piano_id;

  IF live AND new_win THEN
    PERFORM crm_touch_lead(c.email, c.phone, c.first_name, c.last_name,
      'order', 'won', 'order',
      CASE WHEN NEW.status::text = 'pending' THEN 'Paid a deposit' ELSE 'Bought' END || coalesce(' on the ' || piano, ''),
      concat_ws(' · ', NEW.order_number, '$' || to_char(NEW.total, 'FM999,999,990')),
      'orders', NEW.id,
      jsonb_build_object('value', NEW.total, 'customer_id', NEW.customer_id, 'order_id', NEW.id));
  ELSIF NOT live AND was_live THEN
    PERFORM set_config('crm.auto', 'on', true);
    UPDATE leads SET stage = 'deciding', order_id = NULL
     WHERE order_id = NEW.id AND stage = 'won';
    PERFORM set_config('crm.auto', 'off', true);
    PERFORM crm_touch_lead(c.email, c.phone, c.first_name, c.last_name,
      'order', NULL, 'order_cancelled',
      'Order ' || CASE WHEN coalesce(NEW.voided, false) THEN 'voided' ELSE 'cancelled' END,
      concat_ws(' · ', NEW.order_number, piano, nullif(NEW.voided_reason, '')), 'orders', NEW.id);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'crm_from_order: %', SQLERRM;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_crm_orders ON orders;
CREATE TRIGGER trg_crm_orders AFTER INSERT OR UPDATE OF status, voided, customer_id ON orders
  FOR EACH ROW EXECUTE FUNCTION crm_from_order();

-- ----- 10. Payment plans ----------------------------------------------------------
CREATE OR REPLACE FUNCTION crm_from_payment_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c customers%ROWTYPE;
  piano text;
  money text := '$' || to_char(NEW.total_amount, 'FM999,999,990');
  was_signed boolean := false;
  was_paid boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    was_signed := coalesce(OLD.contract_signed, false);
    was_paid := coalesce(OLD.deposit_paid, false);
  END IF;
  IF NEW.customer_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO c FROM customers WHERE id = NEW.customer_id;
  IF c.id IS NULL THEN RETURN NULL; END IF;
  SELECT nullif(concat_ws(' ', brand, model), '') INTO piano FROM pianos WHERE id = NEW.piano_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM crm_touch_lead(c.email, c.phone, c.first_name, c.last_name,
      'payment_plan', 'deciding', 'plan', 'Payment plan started' || coalesce(' for the ' || piano, ''),
      concat_ws(' · ', NEW.plan_number, money), 'payment_plans', NEW.id,
      jsonb_build_object('value', NEW.total_amount, 'customer_id', NEW.customer_id));
  END IF;
  IF (coalesce(NEW.contract_signed, false) AND NOT was_signed)
     OR (coalesce(NEW.deposit_paid, false) AND NOT was_paid) THEN
    PERFORM crm_touch_lead(c.email, c.phone, c.first_name, c.last_name,
      'payment_plan', 'won', 'plan_won',
      CASE WHEN NEW.contract_signed THEN 'Signed their payment plan' ELSE 'Paid the plan deposit' END,
      concat_ws(' · ', NEW.plan_number, piano, money), 'payment_plans', NEW.id,
      jsonb_build_object('value', NEW.total_amount, 'customer_id', NEW.customer_id));
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'crm_from_payment_plan: %', SQLERRM;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_crm_payment_plans ON payment_plans;
CREATE TRIGGER trg_crm_payment_plans AFTER INSERT OR UPDATE OF contract_signed, deposit_paid ON payment_plans
  FOR EACH ROW EXECUTE FUNCTION crm_from_payment_plan();

-- Trigger functions are only ever run by their triggers.
REVOKE ALL ON FUNCTION crm_leads_after(), crm_events_after(), crm_from_viewing_booking(),
  crm_from_viewing_appointment(), crm_from_order(), crm_from_payment_plan() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

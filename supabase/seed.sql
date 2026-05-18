-- =============================================================================
-- SIGNATURE PIANOS — SEED DATA
-- =============================================================================
-- Realistic sample data for development and testing.
--
-- Run this AFTER schema.sql on a fresh database. It is NOT idempotent on
-- repeated runs because of UNIQUE constraints on email / serial_number /
-- number columns. To re-seed, TRUNCATE the affected tables (or reset the
-- database) before re-running.
--
-- All UUIDs are hardcoded so this file is deterministic and self-referencing.
-- All auth-linked columns (user_id) are left NULL because auth.users can't
-- be inserted directly via SQL — link real auth accounts later via UPDATE.
-- =============================================================================


-- =============================================================================
-- CUSTOMERS (3)
-- =============================================================================
INSERT INTO customers (id, first_name, last_name, email, phone, address, suburb, state, postcode, notes) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'Sarah', 'Mitchell', 'sarah.mitchell@example.com', '0412 345 678',
   '14 Brunswick Street', 'Fitzroy', 'VIC', '3065',
   'Repeat customer — previous Kawai upright purchase 2023.'),
  ('22222222-2222-2222-2222-222222222222',
   'James', 'Thornton', 'james.thornton@example.com', '0423 887 211',
   '8 Toorak Road', 'South Yarra', 'VIC', '3141',
   'First-time buyer. Daughter starting lessons.'),
  ('33333333-3333-3333-3333-333333333333',
   'Elena', 'Kovac', 'elena.kovac@example.com', '0438 192 776',
   '22 Sydney Road', 'Brunswick', 'VIC', '3056',
   'Professional pianist — needs concert-grade instrument for home practice.');


-- =============================================================================
-- PIANOS (5 — mix of upright, grand, digital)
-- =============================================================================
INSERT INTO pianos (
  id, type, condition, brand, model, year, serial_number, colour, finish,
  price, sale_price, stock_status, is_unique, requires_delivery_flow,
  requires_tuner_booking, warranty_years, finance_eligible,
  manufacturer_warranty, description, weight_kg, dimensions_cm,
  featured
) VALUES
  ('0a000000-0000-0000-0000-000000000001',
   'acoustic_upright', 'excellent', 'Yamaha', 'U1', 2008, 'JU58392011',
   'Black', 'Polished ebony',
   8400.00, NULL, 'available', false, true, true, 10, true, false,
   'The studio upright generations of pianists have trained on. Bright, articulate, made in Hamamatsu.',
   228.00, '152 W × 65 D × 121 H', true),

  ('0a000000-0000-0000-0000-000000000002',
   'acoustic_upright', 'excellent', 'Kawai', 'K-500', 2014, 'KW2914552',
   'Black', 'Polished ebony',
   9900.00, NULL, 'available', false, true, true, 10, true, false,
   'A modern Kawai upright with refined Millennium III action — concert sound in a contemporary home.',
   227.00, '153 W × 64 D × 125 H', false),

  ('0a000000-0000-0000-0000-000000000003',
   'acoustic_grand', 'excellent', 'Yamaha', 'C3X', 2017, 'GY6258921',
   'Black', 'Polished ebony',
   32800.00, NULL, 'sold', false, true, true, 10, true, false,
   'Conservatory-grade 6-foot-1 grand. Recording-ready voicing, deep sustain, premium hammers.',
   320.00, '186 L × 149 W × 102 H', true),

  ('0a000000-0000-0000-0000-000000000004',
   'acoustic_grand', 'excellent', 'Shigeru Kawai', 'SK-2', 2019, 'SK19002A',
   'Black', 'Polished ebony',
   58400.00, 54900.00, 'reserved', true, true, true, 10, true, true,
   'Hand-finished in Ryuyo by Master Piano Artisans. The instrument you keep for life.',
   325.00, '180 L × 150 W × 102 H', true),

  ('0a000000-0000-0000-0000-000000000005',
   'digital', 'excellent', 'Roland', 'FP-30X', 2024, 'RL30X-22188',
   'Black', 'Matte',
   1399.00, NULL, 'available', false, false, false, 10, false, true,
   'Weighted PHA-4 action with SuperNATURAL piano modelling. A trusted first instrument.',
   14.10, '130 W × 28 D × 15 H', false);


-- =============================================================================
-- ORDERS (2 — both already delivered so we can show full downstream flow)
-- =============================================================================
-- Order 1: Sarah → Yamaha C3X grand (delivered 2 weeks ago)
-- Order 2: Elena → Shigeru Kawai SK-2 grand (paid, delivering)
INSERT INTO orders (
  id, customer_id, piano_id, status,
  subtotal, discount, total, payment_method, payment_reference,
  invoice_sent, invoice_sent_at, notes
) VALUES
  ('00010001-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   '0a000000-0000-0000-0000-000000000003',
   'complete',
   32800.00, 0, 32800.00, 'bank_transfer', 'BT-2026-04-09-883291',
   true, '2026-04-09 10:30:00+10', 'White-glove delivery to Fitzroy. Customer specified upstairs studio room.'),
  ('00010001-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333333',
   '0a000000-0000-0000-0000-000000000004',
   'delivering',
   58400.00, 3500.00, 54900.00, 'finance', 'FN-2026-05-02-117004',
   true, '2026-05-02 14:12:00+10', 'Finance approved via Latitude. Concert-grade delivery crew required.');


-- =============================================================================
-- DELIVERIES (one per order)
-- =============================================================================
-- Tokens are auto-generated by generate_token() default.
INSERT INTO deliveries (
  order_id, driver_name, driver_phone,
  scheduled_date, scheduled_time_window, status,
  pickup_photos, delivery_photos,
  pickup_confirmed_at, delivered_at,
  customer_notified_pickup, customer_notified_delivery,
  notes
) VALUES
  ('00010001-0000-0000-0000-000000000001',
   'Marcus Vale', '0411 990 002',
   '2026-04-15', '9:00 AM – 11:00 AM', 'delivered',
   ARRAY['https://storage.signaturepianos.com/pickup/sp-2026-00001-01.jpg',
         'https://storage.signaturepianos.com/pickup/sp-2026-00001-02.jpg'],
   ARRAY['https://storage.signaturepianos.com/delivery/sp-2026-00001-01.jpg',
         'https://storage.signaturepianos.com/delivery/sp-2026-00001-02.jpg'],
   '2026-04-15 09:12:00+10', '2026-04-15 10:48:00+10',
   true, true,
   'Smooth delivery. Customer extremely happy with placement.'),

  ('00010001-0000-0000-0000-000000000002',
   'Marcus Vale', '0411 990 002',
   '2026-05-22', '1:00 PM – 3:00 PM', 'pickup_pending',
   '{}', '{}',
   NULL, NULL,
   false, false,
   'Concert-grade three-person crew booked. Customer at home all afternoon.');


-- =============================================================================
-- WARRANTIES (one per order — auto-numbered, expiry auto-computed by trigger)
-- =============================================================================
INSERT INTO warranties (
  order_id, customer_id, piano_id,
  start_date, years, certificate_sent, certificate_sent_at,
  certificate_url, status, notes
) VALUES
  ('00010001-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   '0a000000-0000-0000-0000-000000000003',
   '2026-04-15', 10, true, '2026-04-15 11:02:00+10',
   'https://storage.signaturepianos.com/warranties/wrt-2026-00001.pdf',
   'active',
   'Generated automatically on delivery confirmation.'),

  ('00010001-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333333',
   '0a000000-0000-0000-0000-000000000004',
   '2026-05-22', 10, false, NULL,
   NULL,
   'active',
   'Pending — will generate on delivery confirmation.');


-- =============================================================================
-- TUNER BOOKINGS (one per order — auto-booked 3–4 weeks post-delivery)
-- =============================================================================
INSERT INTO tuner_bookings (
  order_id, customer_id, warranty_id,
  tuner_name, tuner_phone, tuner_email,
  scheduled_date, scheduled_time, status, auto_booked,
  confirmation_sent, completion_notes
)
SELECT
  '00010001-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  w.id,
  'Hiroshi Tanaka', '0408 552 119', 'hiroshi@melbournetuners.com.au',
  '2026-05-10', '10:00:00', 'completed', true,
  true, 'Standard 3-week post-delivery tune. Pitch stable, all registers smooth.'
FROM warranties w WHERE w.order_id = '00010001-0000-0000-0000-000000000001';

INSERT INTO tuner_bookings (
  order_id, customer_id, warranty_id,
  tuner_name, tuner_phone, tuner_email,
  scheduled_date, scheduled_time, status, auto_booked,
  confirmation_sent
)
SELECT
  '00010001-0000-0000-0000-000000000002',
  '33333333-3333-3333-3333-333333333333',
  w.id,
  'Hiroshi Tanaka', '0408 552 119', 'hiroshi@melbournetuners.com.au',
  '2026-06-15', '14:00:00', 'pending', true,
  false
FROM warranties w WHERE w.order_id = '00010001-0000-0000-0000-000000000002';


-- =============================================================================
-- VIEWING BOOKINGS (2)
-- =============================================================================
INSERT INTO viewing_bookings (
  first_name, last_name, email, phone,
  preferred_date, preferred_time, pianos_interested,
  how_heard, message, status, notified
) VALUES
  ('Priya', 'Kannan', 'priya.kannan@example.com', '0419 776 002',
   '2026-05-25', 'afternoon',
   ARRAY['Yamaha U1', 'Kawai K-500'],
   'google',
   'Looking for an upright for our 9-year-old daughter who is starting Grade 3. Would love advice on Yamaha vs Kawai for a beginner-intermediate transition.',
   'pending', false),

  ('Owen', 'Tremblay', 'owen.t@example.com', '0407 220 945',
   '2026-05-28', 'late_afternoon',
   ARRAY['Shigeru Kawai SK-2'],
   'instagram',
   'Performing pianist relocating from Sydney. Want to play the SK-2 before deciding between it and a Steinway B.',
   'confirmed', true);


-- =============================================================================
-- TEACHERS (3 — mix of tiers and verification status)
-- =============================================================================
INSERT INTO teachers (
  id, first_name, last_name, email, phone, bio, profile_photo_url,
  suburb, state, postcode, years_experience,
  qualifications, specialties,
  teaches_children, teaches_adults, teaches_online, teaches_in_person,
  studio_address, tier, listing_active, verified
) VALUES
  ('70000000-0000-0000-0000-000000000001',
   'Mei', 'Lin', 'mei.lin@example.com', '0411 552 991',
   'Concert pianist and AMEB examiner with 12 years of teaching experience. Specialises in classical repertoire from beginner Grade 1 through to AMusA preparation.',
   'https://storage.signaturepianos.com/teachers/mei-lin.jpg',
   'Carlton', 'VIC', '3053', 12,
   ARRAY['BMus (Performance) — Melbourne Conservatorium', 'AMEB Grade 8 Theory', 'AMusA Performance'],
   ARRAY['classical', 'AMEB exam prep', 'sight-reading'],
   true, true, true, true,
   '14 Lygon Street, Carlton VIC 3053',
   'full_saas', true, true),

  ('70000000-0000-0000-0000-000000000002',
   'Daniel', 'Reeves', 'daniel.reeves@example.com', '0432 008 124',
   'Jazz pianist and improvisation specialist. Plays regularly at Bird''s Basement and Paris Cat. Teaches the language of jazz from blues fundamentals to advanced harmony.',
   'https://storage.signaturepianos.com/teachers/daniel-reeves.jpg',
   'St Kilda', 'VIC', '3182', 8,
   ARRAY['BMus (Jazz Studies) — Monash University'],
   ARRAY['jazz', 'improvisation', 'contemporary'],
   false, true, true, true,
   NULL,
   'listing_only', true, true),

  ('70000000-0000-0000-0000-000000000003',
   'Priya', 'Kannan', 'priya.k.teacher@example.com', '0428 117 220',
   'Patient and structured teacher who loves working with absolute beginners — especially adults who think they''ve "missed the window". You haven''t.',
   NULL,
   'Hawthorn', 'VIC', '3122', 6,
   ARRAY['Diploma of Music Teaching — Box Hill Institute'],
   ARRAY['beginner', 'adult learners', 'classical'],
   true, true, false, true,
   '8 Glenferrie Road, Hawthorn VIC 3122',
   'listing_only', true, false);


-- =============================================================================
-- TEACHER LISTINGS (one per teacher)
-- =============================================================================
INSERT INTO teacher_listings (
  id, teacher_id, headline, description, hourly_rate,
  trial_lesson_available, trial_lesson_rate,
  lesson_duration_minutes, languages, images, slug, status
) VALUES
  ('71000000-0000-0000-0000-000000000001',
   '70000000-0000-0000-0000-000000000001',
   'Classical piano, AMEB exam preparation, all levels',
   'My students range from absolute beginners to AMusA candidates. I follow the AMEB Piano for Leisure and Classical syllabuses, with strong emphasis on technique, musicality and sight-reading from day one. Lessons available in-studio in Carlton or online via Zoom with a high-quality audio interface.',
   95.00, true, 45.00,
   ARRAY[30, 45, 60], ARRAY['English', 'Mandarin'],
   ARRAY['https://storage.signaturepianos.com/listings/mei-lin-1.jpg',
         'https://storage.signaturepianos.com/listings/mei-lin-2.jpg'],
   'mei-lin-classical-carlton', 'active'),

  ('71000000-0000-0000-0000-000000000002',
   '70000000-0000-0000-0000-000000000002',
   'Jazz piano & improvisation — St Kilda',
   'Whether you''re a classical pianist looking to break into jazz or a complete beginner who wants to play the music you actually love, I''ll teach you the language: blues, ii-V-I, voicings, comping, soloing. Adult learners only.',
   110.00, true, 55.00,
   ARRAY[60, 90], ARRAY['English'],
   ARRAY['https://storage.signaturepianos.com/listings/daniel-reeves-1.jpg'],
   'daniel-reeves-jazz-st-kilda', 'active'),

  ('71000000-0000-0000-0000-000000000003',
   '70000000-0000-0000-0000-000000000003',
   'Beginners and adult learners welcome — Hawthorn',
   'No experience needed. We''ll start with how to sit at the piano, how to read your first notes, and how to play your first song. My adult students often surprise themselves with how fast they progress in a supportive, no-pressure environment.',
   75.00, true, 35.00,
   ARRAY[30, 45], ARRAY['English', 'Tamil'],
   ARRAY[]::text[],
   'priya-kannan-beginners-hawthorn', 'active');


-- =============================================================================
-- ADMIN USER (1)
-- =============================================================================
-- user_id is NULL until you link this row to a real auth.users entry. Until
-- then, is_admin() will return false for this email — that's intentional, the
-- seeded row is a placeholder for the row structure, not a functioning admin.
INSERT INTO admin_users (id, first_name, last_name, email, role, active) VALUES
  ('90000000-0000-0000-0000-000000000001',
   'Eric', 'Kuang', 'eric@signaturepianos.com', 'super_admin', true);


-- =============================================================================
-- END OF SEED
-- =============================================================================

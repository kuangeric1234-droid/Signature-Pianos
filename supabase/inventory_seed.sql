-- Signature Pianos — Inventory Seed
-- Run supabase/alter_pianos.sql FIRST before this file
-- sale_price = the listed retail price shown publicly on the website
-- Discounts applied manually in the admin portal at point of sale
-- condition: A+ = near mint or fully refurbished, B+ = very good
-- All prices AUD inc GST
-- Last updated: May 2026


-- =============================================================================
-- A+ GRADE
-- =============================================================================
-- YU11 6202566 2007 sale_price 8690  featured
-- YU10 6174393 2006 sale_price 6890
-- YU10 5972821 2002 sale_price 6590
-- U30A 5023413 1991 sale_price 7390  featured
-- U10A 4883906 1990 sale_price 4590
-- U3H-R 2405497 1977 sale_price 4690 (fully refurbished)

INSERT INTO pianos (
  brand, model, type, year, serial_number,
  sale_price, condition, slug,
  is_unique, featured,
  stock_status, currency, warranty_years,
  requires_delivery_flow, requires_tuner_booking,
  finance_eligible, manufacturer_warranty,
  images, internal_notes,
  weight_kg, dimensions_cm,
  description, description_short
) VALUES

(
  'Yamaha', 'YU11', 'acoustic_upright', 2007, '6202566',
  8690, 'A+', 'yamaha-yu11-6202566',
  true, true,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  190, '{"height":121,"width":149,"depth":60}',
  'The YU11 is Yamaha''s most modern upright generation — a refined action and improved soundboard bring it closer to a brand-new instrument than anything else in the pre-loved market. This 2007 example plays with crisp response and balanced tone across the full range, and arrived in near-mint condition.',
  'A 2007 Yamaha YU11 in near-mint condition — modern action, refined tone, 10-year warranty included.'
),

(
  'Yamaha', 'YU10', 'acoustic_upright', 2006, '6174393',
  6890, 'A+', 'yamaha-yu10-6174393',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  180, '{"height":121,"width":149,"depth":58}',
  'A modern Yamaha YU10 with the clean, bright tone and responsive touch the series is known for. This 2006 example is in A+ condition and suits intermediate through advanced players who want a serious instrument without the new-piano premium.',
  'A 2006 Yamaha YU10 in A+ condition — clean bright tone, responsive touch, 10-year warranty included.'
),

(
  'Yamaha', 'YU10', 'acoustic_upright', 2002, '5972821',
  6590, 'A+', 'yamaha-yu10-5972821',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  180, '{"height":121,"width":149,"depth":58}',
  'A 2002 Yamaha YU10 with the clean, bright tone and responsive action that define the series. In A+ condition with settled tonal character — well suited to intermediate and advanced players who want depth without paying new-instrument prices.',
  'A 2002 Yamaha YU10 in A+ condition — clean bright tone, responsive touch, 10-year warranty included.'
),

(
  'Yamaha', 'U30A', 'acoustic_upright', 1991, '5023413',
  7390, 'A+', 'yamaha-u30a-5023413',
  true, true,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  220, '{"height":131,"width":149,"depth":63}',
  'The U30A is the larger sibling of Yamaha''s celebrated U3 — a fuller body, richer bass and broader tonal palette that fills a medium-to-large room with ease. This 1991 example is in A+ condition, with a focused mid-range and a clean upper register that rewards serious playing.',
  'A 1991 Yamaha U30A in A+ condition — fuller body, richer bass, 10-year warranty included.'
),

(
  'Yamaha', 'U10A', 'acoustic_upright', 1990, '4883906',
  4590, 'A+', 'yamaha-u10a-4883906',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  180, '{"height":121,"width":149,"depth":58}',
  'A compact Yamaha U10A — bright, clean tone in a manageable footprint that suits smaller homes and apartments. An excellent first piano for beginners through intermediate players, in A+ condition throughout this 1990 example.',
  'A 1990 Yamaha U10A in A+ condition — compact, bright, ideal for smaller spaces.'
),

(
  'Yamaha', 'U3H-R', 'acoustic_upright', 1977, '2405497',
  4690, 'A+', 'yamaha-u3h-r-2405497',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  200, '{"height":121,"width":149,"depth":61}',
  'This 1977 Yamaha U3H-R has been fully refurbished in our Melbourne workshop — every mechanical component restored to A+ standard. It plays and feels like a new instrument, but carries the warmth and character only vintage Japanese craftsmanship delivers.',
  'A fully refurbished 1977 Yamaha U3H-R — vintage character, A+ condition, 10-year warranty included.'
);


-- =============================================================================
-- B+ GRADE
-- =============================================================================
-- U30BL 4602912 1988 sale_price 6190
-- U30BL 4582870 1988 sale_price 6290
-- U3A   4127619 1985 sale_price 5790
-- U3A   3883323 1983 sale_price 5690
-- U3A   3843471 1983 sale_price 5590
-- U3M   3594835 1982 sale_price 4490
-- U3M   3373022 1981 sale_price 4890
-- U3M   3369093 1981 sale_price 4890
-- U3M   3449002 1981 sale_price 4790
-- U3M   3251796 1980 sale_price 4790

INSERT INTO pianos (
  brand, model, type, year, serial_number,
  sale_price, condition, slug,
  is_unique, featured,
  stock_status, currency, warranty_years,
  requires_delivery_flow, requires_tuner_booking,
  finance_eligible, manufacturer_warranty,
  images, internal_notes,
  weight_kg, dimensions_cm,
  description, description_short
) VALUES

(
  'Yamaha', 'U30BL', 'acoustic_upright', 1988, '4602912',
  6190, 'B+', 'yamaha-u30bl-4602912',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  220, '{"height":131,"width":149,"depth":63}',
  'The U30BL extends the U3 family with a larger body, stronger bass response and warmer tonal depth — built to fill medium-to-large rooms. This 1988 example shows age-consistent wear and a settled, characterful tone, in B+ condition throughout.',
  'A 1988 Yamaha U30BL in B+ condition — fuller body, richer bass, 10-year warranty included.'
),

(
  'Yamaha', 'U30BL', 'acoustic_upright', 1988, '4582870',
  6290, 'B+', 'yamaha-u30bl-4582870',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  220, '{"height":131,"width":149,"depth":63}',
  'A 1988 Yamaha U30BL with the fuller body, stronger bass and warmer tonal depth that suit medium-to-large rooms. In B+ condition with age-appropriate character — a serious instrument at a fraction of the new-piano cost.',
  'A 1988 Yamaha U30BL in B+ condition — fuller body, warmer tone, 10-year warranty included.'
),

(
  'Yamaha', 'U3A', 'acoustic_upright', 1985, '4127619',
  5790, 'B+', 'yamaha-u3a-4127619',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  200, '{"height":121,"width":149,"depth":61}',
  'The U3A is the workhorse of Japanese piano making — a reliable action and warm, balanced tone that suits everyone from serious students to advanced players. This 1985 example is in B+ condition with even response across all 88 keys.',
  'A 1985 Yamaha U3A in B+ condition — warm tone, reliable action, 10-year warranty included.'
),

(
  'Yamaha', 'U3A', 'acoustic_upright', 1983, '3883323',
  5690, 'B+', 'yamaha-u3a-3883323',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  200, '{"height":121,"width":149,"depth":61}',
  'A 1983 Yamaha U3A — the reliable action and warm, balanced tone that have made this model a staple of Japanese piano making. In B+ condition with even response across the keyboard, well suited to serious students and advanced players alike.',
  'A 1983 Yamaha U3A in B+ condition — warm tone, reliable action, 10-year warranty included.'
),

(
  'Yamaha', 'U3A', 'acoustic_upright', 1983, '3843471',
  5590, 'B+', 'yamaha-u3a-3843471',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  200, '{"height":121,"width":149,"depth":61}',
  'A 1983 Yamaha U3A — the workhorse upright that defined a generation. Warm, balanced tone and a dependable action, in B+ condition with the character that comes from forty years of careful Japanese ownership.',
  'A 1983 Yamaha U3A in B+ condition — warm tone, reliable action, 10-year warranty included.'
),

(
  'Yamaha', 'U3M', 'acoustic_upright', 1982, '3594835',
  4490, 'B+', 'yamaha-u3m-3594835',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  200, '{"height":121,"width":149,"depth":61}',
  'A classic Yamaha U3M from 1982 — the characterful tone of this early-eighties generation has only deepened with age. Well suited to serious students who want a piano with personality and a touch they can grow with, in B+ condition.',
  'A 1982 Yamaha U3M in B+ condition — classic tone that deepens with age, 10-year warranty included.'
),

(
  'Yamaha', 'U3M', 'acoustic_upright', 1981, '3373022',
  4890, 'B+', 'yamaha-u3m-3373022',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  200, '{"height":121,"width":149,"depth":61}',
  'A 1981 Yamaha U3M — a classic early-eighties upright whose tone has only improved with age. The action remains responsive, the bass is full, and the overall feel rewards thoughtful playing. B+ condition throughout.',
  'A 1981 Yamaha U3M in B+ condition — classic tone with character, 10-year warranty included.'
),

(
  'Yamaha', 'U3M', 'acoustic_upright', 1981, '3369093',
  4890, 'B+', 'yamaha-u3m-3369093',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  200, '{"height":121,"width":149,"depth":61}',
  'A 1981 Yamaha U3M — the characterful early-eighties tone has settled beautifully over four decades. A reliable instrument for serious students and adult returners alike, in B+ condition with age-consistent wear.',
  'A 1981 Yamaha U3M in B+ condition — settled, characterful tone, 10-year warranty included.'
),

(
  'Yamaha', 'U3M', 'acoustic_upright', 1981, '3449002',
  4790, 'B+', 'yamaha-u3m-3449002',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  200, '{"height":121,"width":149,"depth":61}',
  'A 1981 Yamaha U3M with a characterful tone that has only deepened with age. The action is responsive, the keyboard well-balanced, the overall feel that of a piano played and cared for through its life. B+ condition.',
  'A 1981 Yamaha U3M in B+ condition — characterful tone, responsive action, 10-year warranty included.'
),

(
  'Yamaha', 'U3M', 'acoustic_upright', 1980, '3251796',
  4790, 'B+', 'yamaha-u3m-3251796',
  true, false,
  'available', 'AUD', 10,
  true, true,
  false, false,
  '{}', '',
  200, '{"height":121,"width":149,"depth":61}',
  'A 1980 Yamaha U3M — one of the earliest examples of this much-loved early-eighties generation. The tone has matured into something genuinely personal, with a touch that rewards the player. B+ condition, ready to play.',
  'A 1980 Yamaha U3M in B+ condition — matured tone, characterful touch, 10-year warranty included.'
);

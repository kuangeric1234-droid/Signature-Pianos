-- =============================================================================
-- SIGNATURE PIANOS — BLOG TOPIC PLAN (queue for the auto-writer)
-- =============================================================================
-- Run in the Supabase SQL editor after blog.sql and blog_jobs.sql. Safe to
-- re-run: the table, index, trigger and policy are created idempotently, and
-- the seed uses ON CONFLICT (topic_key) DO NOTHING, so re-running never
-- overwrites a topic you've edited (priority, brief, status...).
--
-- Why a new table rather than columns on blog_topics: blog_topics is the
-- writer's memory of titles it has already covered (one insert per draft).
-- Mixing planned topics into it would make every memory row look like a
-- queue item. blog_topic_queue is the plan: one row per topic we intend to
-- write, worked through in priority order.
--
-- How the writer uses it (lib/blog.js, writeAutoDraft):
--   1. take the lowest priority number with status = 'queued'
--   2. research current facts for its brief, then write the draft with the
--      brief, keywords, FAQ questions and internal links as the seed
--   3. save the draft, then set status = 'used', used_at, post_id
--   If nothing is queued (or this table doesn't exist), it chooses a topic
--   freely, as before. Drafts are never auto-published.
--
-- Editing the plan: change priority to reorder; set status = 'skipped' to
-- park a topic (fill in hold_reason); set it back to 'queued' to bring it
-- back. Topic 30 (digital pianos) starts skipped until the digital range
-- launches.
--
-- Seeded from the September 2026 content research (30 topics). intent uses
-- commercial / informational / local; internal_links lists the pages the
-- article should link to, main target first.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS blog_topic_queue (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_key          text NOT NULL UNIQUE,              -- stable handle, used for re-runnable seeding
  priority           integer NOT NULL,                  -- 1 is written first
  working_title      text NOT NULL,
  primary_keyword    text NOT NULL,
  secondary_keywords text[] NOT NULL DEFAULT '{}',
  intent             text[] NOT NULL DEFAULT '{}'
                       CHECK (intent <@ ARRAY['commercial', 'informational', 'local']::text[]),
  funnel_stage       text CHECK (funnel_stage IN ('awareness', 'consideration', 'decision', 'owner')),
  brief              text,                              -- angle + sourced facts + cautions
  faq_questions      text[] NOT NULL DEFAULT '{}',
  internal_links     text[] NOT NULL DEFAULT '{}',      -- main target first
  status             text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued', 'used', 'skipped')),
  hold_reason        text,                              -- why a topic is skipped
  used_at            timestamptz,
  post_id            uuid REFERENCES blog_posts(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_topic_queue_next ON blog_topic_queue (status, priority);

-- keep updated_at fresh (set_updated_at() is created by missing_tables.sql)
DROP TRIGGER IF EXISTS trg_blog_topic_queue_updated_at ON blog_topic_queue;
CREATE TRIGGER trg_blog_topic_queue_updated_at BEFORE UPDATE ON blog_topic_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----- RLS: admins only (the writer uses the service role, which bypasses RLS)
ALTER TABLE blog_topic_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access — blog_topic_queue" ON blog_topic_queue;
CREATE POLICY "Admin full access — blog_topic_queue"
  ON blog_topic_queue FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =============================================================================
-- Seed: the 30 topics, in priority order
-- =============================================================================
INSERT INTO blog_topic_queue
  (topic_key, priority, working_title, primary_keyword, secondary_keywords,
   intent, funnel_stage, brief, faq_questions, internal_links, status, hold_reason)
VALUES
-- 1. Are used Japanese Yamaha pianos any good? An honest guide to "grey market" imports
(
  'grey-market-yamaha', 1,
  'Are used Japanese Yamaha pianos any good? An honest guide to "grey market" imports',
  'grey market yamaha piano',
  ARRAY['japanese grey market pianos', 'grey market piano meaning'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: use the term "grey market" openly and put both sides on the page, then show what Signature does about each risk: every piano chosen in Japan (by Eric or partners who know what he looks for), photographed there before import, checked in the Mount Waverley workshop, a 10-year Signature Pianos warranty, the first tuning included 3-4 weeks after delivery. Local rivals (Sky Music, AMW, Lyra) sell the same kind of stock but don't explain it. All three keyword phrases are in Google AU autocomplete.
Case against: Yamaha AU says most used Yamahas coming into Australia were built for the Japanese market and "may develop issues" in a drier climate, and recommends a technician's inspection before buying (https://au.yamaha.com/en/musical-instruments/pianos/explore/secondhand-faq/ , quoted from a search snippet: check the live page). Kawai AU says these pianos average 30-40 years old and often come from institutions (https://kawai.com.au/2019/08/26/what-is-a-grey-market-piano/). Yamaha AU's warranty excludes instruments imported from overseas (https://au.yamaha.com/en/support/warranty/piano/index.html).
Case for: a UK importer reports 3,800+ pianos since 2002 and no humidity-related returns (https://markgoodwinpianos.co.uk/yamaha/grey-market-yamaha-pianos).
Climate: Tokyo mean relative humidity 65% a year (JMA, https://www.data.jma.go.jp/obd/stats/etrn/view/nml_sfc_ym.php?prec_no=44&block_no=47662&year=&month=&day=&view=). Melbourne Airport 3 pm humidity 44% in January to 65% in June (BOM via https://en.wikipedia.org/wiki/Climate_of_Melbourne). The two aren't measured the same way; say so. Indoor dryness from heating is the real point.
Buyer reality: a 2021 Melbourne thread (a buyer with a $6k budget) describes containers of about 40 randomly selected pianos, grey-market uprights at $3,500-$7,500, and recommends an independent technician (https://forum.pianoworld.com/ubbthreads.php/topics/3072712/re-advice-on-grey-market-yamahas-melbourne-vic.html).
Care: don't say grey market means illegal, or "100% legal". Never imply Yamaha warranty cover. No "humidity-proof".$brief$,
  ARRAY['What does grey market mean?', 'Does it come with a Yamaha warranty?', 'Will it cope with ducted heating?', 'How old is it?', 'Was it a school piano?', 'Can my own technician inspect it?'],
  ARRAY['/instruments/', '/services/delivery-warranty.html'],
  'queued', NULL
),
-- 2. How much does a second-hand piano cost in Australia? 2026 price guide
(
  'used-piano-prices-australia', 2,
  'How much does a second-hand piano cost in Australia? 2026 price guide',
  'used yamaha piano price',
  ARRAY['yamaha u3 piano price', 'upright piano price australia', 'yamaha u3m second hand price'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: price bands by tier (older U1 or Kawai; mid U3H/M/A; premium UX/YUS/W; then grands), compared with new prices, plus the full cost of ownership. Date-stamp the page and every price. AC: "how much is a used piano". Dealer prices are scattered across sites.
New prices: U1J $7,299-$7,999 and U1PEQ $11,299-$12,499 (https://dwmusic.com.au/collections/yamaha-u-series-upright-pianos). U3PEQ $16,499 (https://pianocity.com.au/product/yamaha-u3peq-upright-piano-polished-ebony/).
Used prices from dealers: Japanese uprights $1,500-$10,000 and a U1 at $4,500 (https://www.pianosvictoria.com/melbourne-piano-sales). $2,950-$24,800 (https://australianmusicworld.com.au/secondhand). YUS3 $13,900 and U30BL $7,900 (https://lyrapianos.com.au/product-category/yamaha-pianos/).
Negotiation: expect 15-30% off asking on new pianos. A 5-year-old YUS1 sold for $7,700 in 2018 (https://forums.whirlpool.net.au/archive/2718304).
Running costs: tuning $200-$350 (https://flowpiano.com.au/blog/20260517%20-%20Piano%20tuning%20cost%20Melbourne?lang=en). Moving $260-$420 (https://www.harrythepianomover.com.au/).
Care: never state Signature prices or stock. Say whether prices include GST. Linking rival dealers is Eric's call.$brief$,
  ARRAY['What is a used U3 worth?', 'Is a used Japanese U3 better value than a new U1J?', 'Can I negotiate?', 'What does delivery add?', 'What is my old piano worth?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 3. Yamaha U1 vs U3: which upright suits your home?
(
  'yamaha-u1-vs-u3', 3,
  'Yamaha U1 vs U3: which upright suits your home?',
  'yamaha u1 vs u3',
  ARRAY['yamaha u3 dimensions', 'u1 or u3 yamaha piano'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: decide by room, sound and budget, then invite readers to play both side by side at the showroom. It's the top "vs" suggestion for both models, and these two are the core stock.
Facts: U1 about 121 cm tall, U3 about 131 cm (https://churairatmusic.com/en/blog/2026/07/yamaha-u1h-u1m-u1a-u3h-u3m-u3a-differences). They weigh 228 kg and 235 kg; the U3 has longer strings and more bass (https://faustharrisonpianos.com/yamaha-u1-vs-u3-what-is-the-difference/).
Mention the YUS1/YUS3 equivalents and the UX. A good 130 cm upright beats a small grand (https://markgoodwinpianos.co.uk/faq/baby-grand-vs-upright-piano).
Care: sources conflict on YUS3 pedals. The U1J is Indonesian-made.$brief$,
  ARRAY['Is the U3 worth the extra?', 'Is a U3 too loud for a small room?', 'Which is better for AMEB exams?', 'U1 or U3 for a beginner?', 'What about the U1J?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 4. Yamaha serial number lookup: how to check a piano's age and factory
(
  'yamaha-serial-number-lookup', 4,
  'Yamaha serial number lookup: how to check a piano''s age and factory',
  'yamaha piano serial number lookup',
  ARRAY['yamaha piano serial number search australia', 'yamaha piano serial number lookup japan', 'piano age by serial number'],
  ARRAY['commercial', 'informational'], 'consideration',
  $brief$Angle: step by step: find the number, convert it to a year, check the factory, and explain what age means for condition. AC includes an Australia-specific variant; nearby rival AMW already has a serial page.
Where to look: the serial is inside the top lid, on the frame or plate (https://usa.yamaha.com/support/finding_age_of_yamaha_piano/index.html).
Japanese serial reference points: about 978000 in 1970, 3001000 in 1980, 4811000 in 1990, 5868000 in 2000 and 6280000 in 2010 (https://markgoodwinpianos.co.uk/yamaha/yamaha-piano-serial-numbers). The same source warns that a "J" followed by a gap does not mean Jakarta.
Kawai: Kawai AU explains where to find the serial and how to date it (https://kawai.com.au/2022/09/20/when-was-your-kawai-piano-made/).
Care: a serial dates a piano; it can't show which market it was sold in. Don't promise every Signature listing shows the year unless Eric confirms.$brief$,
  ARRAY['Where is the serial number on an upright?', 'How old is my Yamaha?', 'Does "J" in the serial mean Indonesia?', 'Can a serial number show which market a piano was sold in?', 'Is a 1980s piano too old?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 5. Yamaha model codes decoded: U3H, U3M, U3A, UX, YUS and W series
(
  'yamaha-model-codes', 5,
  'Yamaha model codes decoded: U3H, U3M, U3A, UX, YUS and W series',
  'yamaha u3h vs u3m',
  ARRAY['yamaha ux3 vs u3', 'yamaha u3h year', 'yamaha yus3 vs u3'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: a glossary for reading listings, linking to live stock. AC has a dense cluster of these comparisons, and listings use the codes (https://markgoodwinpianos.co.uk/yamaha/difference-u3-u30a-u30bl-yu30-ux-ux3-yu3s-yu3sxg-yu5sxg-yua).
Suffix letters are production eras: H about 1972-80, M 1980-82, A 1982-87 (https://churairatmusic.com/en/blog/2026/07/yamaha-u1h-u1m-u1a-u3h-u3m-u3a-differences). The code says nothing about condition.
Other models: UX has an X-braced back at 131 cm. The U30 series ran 1988-94 and YU3/YU30 1997-2004 (Mark Goodwin, above). W-series are 131 cm wood-cabinet models voiced darker (https://markgoodwinpianos.co.uk/yamaha/yamaha-w102b-upright-piano-review). The b121 is Indonesian-made.
Care: sources conflict on YUS3 pedals; no component claims ("German strings", "CFX hammers") unless Yamaha confirms.$brief$,
  ARRAY['Is a UX better than a U3?', 'What is a YUS?', 'What is the W series?', 'U30BL vs U3: what is the difference?', 'Are newer models always better?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 6. Buying a second-hand piano in Melbourne: a checklist before you pay
(
  'melbourne-buying-checklist', 6,
  'Buying a second-hand piano in Melbourne: a checklist before you pay',
  'second hand pianos melbourne',
  ARRAY['used pianos for sale melbourne', 'piano dealers melbourne'],
  ARRAY['commercial', 'local'], 'decision',
  $brief$Angle: a printable checklist plus what happens at a Signature viewing. Say outright that buyers can bring their own technician or teacher (confirm with Eric). Top AC completion for "second hand piano"; forums keep telling buyers to try and inspect in person (https://forum.pianoworld.com/ubbthreads.php/topics/3480953/ok-to-buy-a-40-year-old-paino.html , https://forums.whirlpool.net.au/archive/2676240).
What to check: hammer wear, buzzing or rattles, even response across dynamics (https://forum.pianoworld.com/ubbthreads.php/topics/3072712/re-advice-on-grey-market-yamahas-melbourne-vic.html); bridges, tuning pins and soundboard (PW 3480953, above). An independent appraisal costs about $180 + GST (https://www.pianodoctor.com.au/pricing.html).
Consumer law: consumer guarantees cover used goods bought from a business but not private sales (https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees).$brief$,
  ARRAY['What should I check?', 'Should I bring a technician?', 'Dealer or private seller?', 'How long should I play it?', 'When is the first tuning?'],
  ARRAY['/services/book-a-viewing.html'],
  'queued', NULL
),
-- 7. Piano tuning cost in Melbourne, and how often you really need it
(
  'piano-tuning-cost-melbourne', 7,
  'Piano tuning cost in Melbourne, and how often you really need it',
  'piano tuning cost melbourne',
  ARRAY['how often piano tuning', 'piano tuner melbourne eastern suburbs'],
  ARRAY['local'], 'owner',
  $brief$Angle: what tuning costs in Melbourne, how often a home piano needs it, and why the first tuning after delivery matters. In AC. A Box Hill technician ranks with a 2026 post that puts tuning at $200-$350 (https://flowpiano.com.au/blog/20260517%20-%20Piano%20tuning%20cost%20Melbourne?lang=en); date-stamp it.
Signature: the first tuning is included 3-4 weeks after delivery.
Care: don't quote a Signature tuning price or service area unless Eric supplies it.$brief$,
  ARRAY['How much does piano tuning cost in Melbourne?', 'How often should a piano be tuned?', 'What happens if a piano isn''t tuned for years?', 'Is the first tuning after delivery included?'],
  ARRAY['/services/tuning-servicing.html'],
  'queued', NULL
),
-- 8. Piano care in Melbourne: heaters, hot northerlies and humidity
(
  'piano-humidity-melbourne', 8,
  'Piano care in Melbourne: heaters, hot northerlies and humidity',
  'piano humidity',
  ARRAY['piano keys sticking humidity', 'piano humidity level'],
  ARRAY['informational'], 'awareness',
  $brief$Angle: humidity is the main objection raised against Japanese imports (https://au.yamaha.com/en/musical-instruments/pianos/explore/secondhand-faq/). Explain what indoor dryness from ducted heating and hot northerly days does to any piano, and practical placement and care. Serves buyers weighing an import and owners (awareness and owner stages).
Facts: Tokyo mean relative humidity 65% (JMA, https://www.data.jma.go.jp/obd/stats/etrn/view/nml_sfc_ym.php?prec_no=44&block_no=47662&year=&month=&day=&view=); Melbourne Airport 3 pm humidity 44% (January) to 65% (June) (https://en.wikipedia.org/wiki/Climate_of_Melbourne). Different measures; say so.
Care: never claim humidity-proof or "seasoned for Australia" for Japanese-market pianos.$brief$,
  ARRAY['What humidity level is right for a piano?', 'Why do piano keys stick?', 'Is ducted heating bad for a piano?', 'Where should a piano go in the house?'],
  ARRAY['/services/tuning-servicing.html'],
  'queued', NULL
),
-- 9. Used piano warranties explained: dealer, manufacturer and consumer law
(
  'used-piano-warranty', 9,
  'Used piano warranties explained: dealer, manufacturer and consumer law',
  'used piano warranty',
  ARRAY['yamaha piano warranty', 'piano warranty australia'],
  ARRAY['commercial'], 'decision',
  $brief$Angle: the three layers. Manufacturer: Yamaha AU's warranty excludes imported instruments (https://au.yamaha.com/en/support/warranty/piano/index.html). Dealer: rivals advertise 10-15 years (https://skymusic.com.au/pages/secondhand-piano , https://australianmusicworld.com.au/secondhand). Consumer law: guarantees cover used goods from a business, not private sales (https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees).
Signature: the 10-year Signature Pianos warranty, which sits alongside ACL rights. Include the ACL mandatory wording for a warranty against defects, checked against https://www.accc.gov.au/consumers/buying-products-and-services/warranties .
Care: never suggest the warranty limits consumer-law rights; don't describe cover details Eric hasn't confirmed.$brief$,
  ARRAY['Does Yamaha''s warranty cover an imported piano?', 'What does a dealer warranty cover?', 'What are my consumer-law rights on a pre-loved piano?', 'Does a private sale come with any guarantee?'],
  ARRAY['/services/delivery-warranty.html'],
  'queued', NULL
),
-- 10. Upright or grand piano: which is right for your home?
(
  'upright-vs-grand', 10,
  'Upright or grand piano: which is right for your home?',
  'upright vs grand piano',
  ARRAY['baby grand piano size', 'baby grand piano melbourne'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: choose by room, sound and budget. In AC. Argument to use: a good 130 cm upright beats a grand under 5 ft (https://markgoodwinpianos.co.uk/faq/baby-grand-vs-upright-piano).
Care: no Signature prices or stock claims; take grand lengths from Yamaha or Kawai sources.$brief$,
  ARRAY['Is a grand piano better than an upright?', 'How much room does a baby grand need?', 'Is a small grand better than a tall upright?', 'Can a grand go in an upstairs room?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 11. Acoustic or digital piano for a beginner? A guide for Australian families
(
  'acoustic-vs-digital-beginner', 11,
  'Acoustic or digital piano for a beginner? A guide for Australian families',
  'digital piano vs acoustic piano',
  ARRAY['what piano should i buy for my child', 'best piano for beginners australia'],
  ARRAY['commercial'], 'awareness',
  $brief$Angle: an honest guide for families whose child has started lessons. Keeps coming up on Whirlpool (https://forums.whirlpool.net.au/archive/2676240 , https://forums.whirlpool.net.au/archive/3pxjnp58). AMEB Victoria allows digital pianos only up to Grade 4 for exams by video (https://ameb.vic.edu.au/practical-information/exams-by-video/).
Care: digital pianos aren't stocked yet; compare neutrally and don't promote a digital range. Don't say listed teachers are checked. Avoid "best" in prose even though it's in the keyword.$brief$,
  ARRAY['Should a beginner start on a digital or an acoustic piano?', 'When does a child need an acoustic piano?', 'Can you sit AMEB exams on a digital piano?', 'What should I spend on a first piano?'],
  ARRAY['/instruments/', '/teachers.html'],
  'queued', NULL
),
-- 12. Piano movers in Melbourne: what it costs and what to ask
(
  'piano-movers-melbourne', 12,
  'Piano movers in Melbourne: what it costs and what to ask',
  'piano movers melbourne cost',
  ARRAY['piano removalists melbourne eastern suburbs', 'piano removal cost melbourne'],
  ARRAY['local'], 'decision',
  $brief$Angle: what moving a piano across Melbourne costs and what to ask a removalist. AC includes "eastern suburbs". Rate cards are public, e.g. moves at $260-$420 (https://www.harrythepianomover.com.au/); date-stamp.
Signature: white-glove delivery, booked and tracked in the customer portal.
Care: don't state Signature delivery prices or areas unless Eric confirms.$brief$,
  ARRAY['How much does it cost to move a piano in Melbourne?', 'What should I ask a piano removalist?', 'Does a piano need tuning after a move?', 'Can a piano go up stairs?'],
  ARRAY['/services/delivery-warranty.html'],
  'queued', NULL
),
-- 13. Made in Japan or Indonesia? Telling a U1 from a U1J or b121
(
  'yamaha-japan-vs-indonesia', 13,
  'Made in Japan or Indonesia? Telling a U1 from a U1J or b121',
  'yamaha piano japan vs indonesia',
  ARRAY['yamaha u1j', 'yamaha b121 price'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: how to tell where a Yamaha was built, and why it matters less than condition. In AC. A new U1J sells from $7,299 (https://dwmusic.com.au/collections/yamaha-u-series-upright-pianos), and the b121 is Indonesian-made (https://www.royalpianos.com/en/shop/pre-owned/upright-pianos-en-preowned/yamaha-b121/). A "J" followed by a gap in a serial does not mean Jakarta (https://markgoodwinpianos.co.uk/yamaha/yamaha-piano-serial-numbers).
Care: only say "made in Japan" when the serial or stamp confirms it; not every piano sourced from Japan was built there.$brief$,
  ARRAY['Where are Yamaha pianos made?', 'What is the difference between a U1 and a U1J?', 'Is the b121 made in Japan?', 'How can I tell where a piano was built?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 14. Yamaha or Kawai: which second-hand Japanese upright should you buy?
(
  'kawai-vs-yamaha-upright', 14,
  'Yamaha or Kawai: which second-hand Japanese upright should you buy?',
  'kawai vs yamaha upright piano',
  ARRAY['kawai piano second hand', 'yamaha u3 vs kawai k500'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: a fair comparison of pre-loved Japanese Yamaha and Kawai uprights. In AC. Whirlpool users recommend Kawais imported from Japan (https://forums.whirlpool.net.au/archive/2285144). Balance with Kawai AU on grey-market pianos (https://kawai.com.au/2019/08/26/what-is-a-grey-market-piano/).
Care: no invented specs; name models precisely; no claims about resale value.$brief$,
  ARRAY['Is Kawai as good as Yamaha?', 'How do the Yamaha U3 and Kawai K500 compare?', 'Are pre-loved Kawais imported from Japan too?', 'Which should I choose for a child?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 15. Piano lessons in Melbourne: what they cost and how to choose a teacher
(
  'piano-lessons-melbourne', 15,
  'Piano lessons in Melbourne: what they cost and how to choose a teacher',
  'piano lessons melbourne price',
  ARRAY['piano teacher melbourne', 'piano lessons glen waverley'],
  ARRAY['local'], 'awareness',
  $brief$Angle: what lessons cost and how to choose a teacher. In AC. Typical rate $40-$60 per 30 minutes (https://www.manhattanmusic.com.au/blog/music-lessons-cost-melbourne/); date-stamp. Victoria requires a Working with Children Check for private tuition of children (https://www.vic.gov.au/do-i-need-check).
Care: only say teachers are checked if they actually are; don't say the directory's teachers are verified or vetted unless Eric confirms.$brief$,
  ARRAY['How much do piano lessons cost in Melbourne?', 'How do I choose a piano teacher?', 'How long should a child''s first lessons be?', 'Does a private piano teacher need a Working with Children Check?'],
  ARRAY['/teachers.html'],
  'queued', NULL
),
-- 16. Can you have a piano in an apartment or townhouse in Victoria?
(
  'piano-in-apartment', 16,
  'Can you have a piano in an apartment or townhouse in Victoria?',
  'piano in apartment noise',
  ARRAY['acoustic piano in apartment', 'upright piano in apartment'],
  ARRAY['informational'], 'awareness',
  $brief$Angle: playing an acoustic piano in an apartment or townhouse in Victoria. In AC. EPA Victoria sets hours for musical instruments (https://www.epa.vic.gov.au/residential-noise). Practical: placement, rugs, the practice pedal, silent systems.
Care: strata or owners corporation rules can be stricter than EPA hours; say so. Recheck the EPA hours each year.$brief$,
  ARRAY['Can I have a piano in an apartment in Victoria?', 'What hours can I play under EPA Victoria rules?', 'How can I make an acoustic piano quieter?', 'Do owners corporation rules apply?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 17. How long do pianos last? What a 30 to 40 year old Yamaha has left
(
  'how-long-do-pianos-last', 17,
  'How long do pianos last? What a 30 to 40 year old Yamaha has left',
  'how long do pianos last',
  ARRAY['is a 40 year old piano worth buying', 'are used pianos worth anything'],
  ARRAY['informational'], 'consideration',
  $brief$Angle: an honest look at age. Kawai AU says imports are 30-40 years old and near the end of their life (https://kawai.com.au/2019/08/26/what-is-a-grey-market-piano/). Forum technicians disagree (https://forum.pianoworld.com/ubbthreads.php/topics/3480953/ok-to-buy-a-40-year-old-paino.html). Put both sides, and explain what wears (hammers, strings, action) versus what lasts.
Care: no lifespan guarantees.$brief$,
  ARRAY['How long does a piano last?', 'Is a 40-year-old piano worth buying?', 'What wears out first on an older piano?', 'Are pre-loved pianos worth anything?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 18. Reconditioned, refurbished or restored? What the labels mean
(
  'reconditioned-piano-meaning', 18,
  'Reconditioned, refurbished or restored? What the labels mean',
  'reconditioned piano meaning',
  ARRAY['are refurbished pianos good', 'refurbished yamaha u3'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: what reconditioned, refurbished and restored actually mean, and what to ask. In AC. A Melbourne technician says shops skip regulation work (https://flowpiano.com.au/blog/20231212%20-%20The%20truth%20piano%20shops%20don't%20want%20you%20to%20know). Explain regulation simply.
Care: describe Signature's work only as "checked in our Mount Waverley workshop" unless Eric supplies specifics.$brief$,
  ARRAY['What does reconditioned mean for a piano?', 'Are refurbished pianos good?', 'What is regulation?', 'What should I ask about work done on a piano?'],
  ARRAY['/services/tuning-servicing.html'],
  'queued', NULL
),
-- 19. Piano sizes and weights: will it fit, and get through the door?
(
  'piano-sizes-weights', 19,
  'Piano sizes and weights: will it fit, and get through the door?',
  'upright piano dimensions',
  ARRAY['upright piano weight', 'how much does a piano weigh'],
  ARRAY['informational'], 'awareness',
  $brief$Angle: will it fit, and get through the door? Four separate AC phrases. A U3 weighs about 235 kg and a U1 about 228 kg (https://faustharrisonpianos.com/yamaha-u1-vs-u3-what-is-the-difference/); U1 about 121 cm and U3 about 131 cm tall (https://churairatmusic.com/en/blog/2026/07/yamaha-u1h-u1m-u1a-u3h-u3m-u3a-differences).
Care: take widths and depths from Yamaha or Kawai spec sheets before stating them.$brief$,
  ARRAY['How much does an upright piano weigh?', 'What are the dimensions of a Yamaha U1 and U3?', 'Will a piano fit through a standard door?', 'Can a piano go on an upper floor?'],
  ARRAY['/services/delivery-warranty.html'],
  'queued', NULL
),
-- 20. When should you tune a piano after delivery?
(
  'tune-after-delivery', 20,
  'When should you tune a piano after delivery?',
  'piano out of tune after moving',
  ARRAY['how long does piano stay in tune'],
  ARRAY['informational'], 'owner',
  $brief$Angle: why a piano goes out of tune after a move and when to tune it. In AC. Usual advice is to wait 2-8 weeks (https://www.movinghelp.com/move/when-to-tune-piano-after-moving/).
Signature: the first tuning is included 3-4 weeks after delivery.$brief$,
  ARRAY['How long after moving should a piano be tuned?', 'Why does a piano go out of tune after a move?', 'How long does a piano stay in tune?'],
  ARRAY['/services/tuning-servicing.html'],
  'queued', NULL
),
-- 21. Buying a second-hand Yamaha grand: G and C series sizes explained
(
  'yamaha-grand-sizes', 21,
  'Buying a second-hand Yamaha grand: G and C series sizes explained',
  'yamaha grand piano sizes',
  ARRAY['yamaha c3 piano price', 'baby grand piano for sale second hand'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: Yamaha grand sizes (C and G series) explained for pre-loved buyers. In AC. Local rivals list C1-G3 grands (https://skymusic.com.au/pages/yamaha-piano).
Care: take lengths from Yamaha sources; no Signature prices or stock claims.$brief$,
  ARRAY['What sizes are Yamaha grand pianos?', 'What is the difference between the G and C series?', 'What size grand fits a living room?', 'What does a pre-loved C3 cost?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 22. Silent pianos and practice pedals: playing an acoustic quietly
(
  'silent-pianos', 22,
  'Silent pianos and practice pedals: playing an acoustic quietly',
  'silent piano price',
  ARRAY['yamaha silent piano', 'practice pedal piano'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: ways to play an acoustic quietly: factory silent systems, aftermarket systems and the practice pedal. In AC. A new U1 Silent was $14,999 on sale (https://dwmusic.com.au/collections/yamaha-u-series-upright-pianos); date-stamp.
Care: always say whether a system is factory Yamaha SILENT or aftermarket.$brief$,
  ARRAY['What is a silent piano?', 'How much does a Yamaha silent piano cost?', 'What is a practice pedal?', 'Is a factory silent system better than an aftermarket one?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 23. What age should a child start piano?
(
  'child-piano-age', 23,
  'What age should a child start piano?',
  'piano age to start',
  ARRAY['piano lessons for kids', 'best piano for kids to learn on'],
  ARRAY['informational'], 'awareness',
  $brief$Angle: when a child is ready for lessons, written for parents. In AC. Roland AU ranks for it (https://rolandcorp.com.au/blog/your-childs-first-piano-lessons-pt-1); be more useful and local.
Care: cite sources for any age guidance; no invented developmental claims. Avoid "best" in prose.$brief$,
  ARRAY['What age should a child start piano?', 'Is my child too young for lessons?', 'What piano should a young beginner learn on?'],
  ARRAY['/teachers.html'],
  'queued', NULL
),
-- 24. Learning piano as an adult in Melbourne: is 40 or 50 too late?
(
  'adult-piano-melbourne', 24,
  'Learning piano as an adult in Melbourne: is 40 or 50 too late?',
  'piano lessons for adults melbourne',
  ARRAY['learn piano at 40', 'adult beginner piano lessons'],
  ARRAY['local', 'informational'], 'awareness',
  $brief$Angle: reassure adults starting or coming back to piano in Melbourne. AC has "learn piano at 30/40/50".
Care: no invented success stories or reviews; don't say listed teachers are checked.$brief$,
  ARRAY['Is 40 or 50 too late to learn piano?', 'How should an adult beginner start?', 'What piano should an adult beginner buy?'],
  ARRAY['/teachers.html'],
  'queued', NULL
),
-- 25. AMEB exams: when does your child need an acoustic piano?
(
  'ameb-acoustic-piano', 25,
  'AMEB exams: when does your child need an acoustic piano?',
  'ameb digital piano',
  ARRAY['ameb grade 5 acoustic piano'],
  ARRAY['informational'], 'consideration',
  $brief$Angle: when an AMEB student needs an acoustic piano. AMEB Victoria allows digital pianos only up to Grade 4 for exams by video (https://ameb.vic.edu.au/practical-information/exams-by-video/). A Whirlpool thread asks about Grade 6 (https://forums.whirlpool.net.au/archive/2128079).
Care: rules differ by state and syllabus and change; recheck each year and link the source.$brief$,
  ARRAY['Can you sit AMEB exams on a digital piano?', 'At what grade do you need an acoustic piano?', 'Do the rules differ between states?'],
  ARRAY['/instruments/', '/teachers.html'],
  'queued', NULL
),
-- 26. Paying off a piano: payment plans vs rent-to-own
(
  'piano-payment-plans', 26,
  'Paying off a piano: payment plans vs rent-to-own',
  'piano rent to own',
  ARRAY['piano finance', 'piano rental melbourne'],
  ARRAY['commercial'], 'decision',
  $brief$Angle: the options for spreading the cost of a piano: payment plans, rent-to-own and rental. A cluster of AC phrases.
Care: credit law wasn't researched. Don't call anything "finance" or "interest-free" and don't state terms without Eric's confirmation and advice.$brief$,
  ARRAY['Can I pay off a piano over time?', 'What is the difference between a payment plan and rent-to-own?', 'Can I rent a piano in Melbourne?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 27. Shigeru Kawai and Bösendorfer: when a premium pre-loved piano makes sense
(
  'premium-pre-loved-pianos', 27,
  'Shigeru Kawai and Bösendorfer: when a premium pre-loved piano makes sense',
  'shigeru kawai price',
  ARRAY['shigeru kawai sk2 price', 'bosendorfer piano australia'],
  ARRAY['commercial'], 'decision',
  $brief$Angle: when a premium pre-loved piano makes sense, written for a serious buyer. In AC; few searches but each lead is worth a lot.
Care: no Signature prices or stock claims unless Eric confirms; no component claims without maker sources.$brief$,
  ARRAY['What does a pre-loved Shigeru Kawai cost?', 'What sets a Bösendorfer apart?', 'When is a premium pre-loved piano worth it?'],
  ARRAY['/services/book-a-viewing.html'],
  'queued', NULL
),
-- 28. What to do with an old piano in Melbourne: sell, donate or dispose
(
  'old-piano-melbourne', 28,
  'What to do with an old piano in Melbourne: sell, donate or dispose',
  'sell my piano melbourne',
  ARRAY['piano disposal melbourne', 'what is a second hand piano worth'],
  ARRAY['local'], 'awareness',
  $brief$Angle: the options for an old piano: sell, donate or dispose. In AC. Disposal of an upright costs $320 (https://www.harrythepianomover.com.au/); date-stamp. Flow Piano ranks for it (https://flowpiano.com.au/blog/How%20to%20dispose%20a%20piano%20in%20Melbourne).
Care: don't offer trade-ins or buy-backs unless Eric confirms.$brief$,
  ARRAY['How do I sell my old piano in Melbourne?', 'What is my old piano worth?', 'How much does piano disposal cost?', 'Can I donate a piano?'],
  ARRAY['/services/delivery-warranty.html'],
  'queued', NULL
),
-- 29. What do the three piano pedals do?
(
  'piano-pedals', 29,
  'What do the three piano pedals do?',
  'piano pedals what do they do',
  ARRAY['piano pedals names', 'sostenuto pedal'],
  ARRAY['informational'], 'awareness',
  $brief$Angle: what each pedal does, and a good place to explain the practice (mute) pedal on Japanese uprights. Several AC variants.
Care: sources conflict on YUS3 pedals; don't state any model's pedal layout without checking.$brief$,
  ARRAY['What do the three piano pedals do?', 'What is the sostenuto pedal?', 'What is the practice pedal on a Japanese upright?'],
  ARRAY['/instruments/'],
  'queued', NULL
),
-- 30. Best digital pianos for beginners in Australia (publish when the digital range launches)
(
  'digital-pianos-beginners', 30,
  'Best digital pianos for beginners in Australia (publish when the digital range launches)',
  'best digital piano australia',
  ARRAY['roland vs kawai digital piano', 'yamaha clavinova vs kawai'],
  ARRAY['commercial'], 'consideration',
  $brief$Angle: beginner digital pianos for Australian families. Lots of AC phrases. Hold until the digital range is in stock; the brand keeps digital out of the front door until then.
Care: avoid "best" in prose even though it's in the keyword.$brief$,
  ARRAY['Which digital piano suits a beginner?', 'Roland, Kawai or Yamaha: which digital piano?', 'Clavinova or Kawai: how do they compare?'],
  ARRAY['/instruments/'],
  'skipped', 'Held until the digital range launches. Set status to queued when digital pianos are in stock.'
)
ON CONFLICT (topic_key) DO NOTHING;

-- If the cornerstone drafts (blog_seed_drafts.sql) are already in, mark their
-- topics used so the writer doesn't draft them again.
UPDATE blog_topic_queue q
   SET status = 'used', used_at = now(), post_id = p.id
  FROM (VALUES
         ('grey-market-yamaha', 'grey-market-yamaha-pianos'),
         ('yamaha-u1-vs-u3', 'yamaha-u1-vs-u3'),
         ('melbourne-buying-checklist', 'second-hand-piano-checklist-melbourne')
       ) AS m(topic_key, slug)
  JOIN blog_posts p ON p.slug = m.slug
 WHERE q.topic_key = m.topic_key
   AND q.status = 'queued';

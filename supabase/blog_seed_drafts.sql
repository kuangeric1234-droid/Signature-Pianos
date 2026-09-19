-- =============================================================================
-- SIGNATURE PIANOS — THREE CORNERSTONE BLOG DRAFTS (for Eric to review)
-- =============================================================================
-- Run in the Supabase SQL editor after blog.sql (and ideally after
-- blog_topic_plan.sql). Safe to re-run: ON CONFLICT (slug) DO NOTHING, so a
-- draft you've already edited is never overwritten.
--
-- Inserts three posts as status 'draft', source 'manual', author 'Eric Kuang':
--   /blog/grey-market-yamaha-pianos
--     Are grey market Yamaha pianos any good? An honest guide
--   /blog/yamaha-u1-vs-u3
--     Yamaha U1 vs U3: which upright suits your home?
--   /blog/second-hand-piano-checklist-melbourne
--     Buying a second-hand piano in Melbourne: a checklist
--
-- Review them in the admin: Marketing > Blog > Edit. Each body starts with an
-- HTML comment listing what to check (<!-- VERIFY ... -->), plus any inline
-- notes. The public page strips HTML comments, so these never reach readers,
-- but do tidy them up before publishing.
--
-- Facts come from the September 2026 content research and are cited as plain
-- links in the text. No Signature prices, stock or reviews are stated.
-- =============================================================================

-- Are grey market Yamaha pianos any good? An honest guide
INSERT INTO blog_posts
  (slug, title, meta_description, excerpt, body_html, tags, keywords, faq, author, status, source)
VALUES (
  'grey-market-yamaha-pianos',
  'Are grey market Yamaha pianos any good? An honest guide',
  'What grey market means for a Yamaha piano, what Yamaha and Kawai Australia say, and what to check before you buy a pre-loved Japanese upright.',
  'Most pre-loved Yamahas in Australia were built for Japan. What that means, what the local distributors warn about, and what to check before you buy.',
  $body$<!-- VERIFY before publishing (for Eric):
1. The two Yamaha Australia points (pre-owned FAQ and the warranty exclusion) came from search snippets; the pages returned 403 to our researcher. Open both links and check the wording still matches.
2. The invitation to bring a technician or teacher to a viewing (question list and FAQ): confirm you're happy to offer it.
3. Warranty: confirm every piano carries the 10-year Signature Pianos warranty, and that the certificate includes the Australian Consumer Law mandatory text for a warranty against defects.
4. Mark Goodwin's figure (3,800+ pianos since 2002, no humidity-related returns): recheck on the live page.
5. This links to /blog/second-hand-piano-checklist-melbourne. Publish both drafts together, or remove the link.
6. Add a hero photo if you like: a real piano photographed in Japan, from stock you have now.
-->
<p>Many are very good pianos, and some are tired ones. "Grey market" describes the route a piano took to Australia, not how well it plays. Most pre-loved Yamahas for sale here were built for the Japanese market and brought in later, so the useful question isn't the label. It's the individual piano: how old it is, how it was kept, what has been done to it since, and who stands behind it once it's in your home.</p>
<p>Every piano we sell is chosen in Japan, inspected there by me or by partners who know exactly what I look for, and checked again in our Mount Waverley workshop. So this is a question I think about every week. Below is what the local distributors say, what the other side says, and what I'd check before buying any imported piano, from us or from anyone else.</p>

<h2>What does grey market mean?</h2>
<p>A grey market piano was made for, and first sold in, one country, then later brought into another by someone other than the maker's local distributor. For Yamaha and Kawai uprights in Australia, that almost always means a piano built for Japan, played there for some years, then shipped here as a pre-loved piano.</p>
<p>You'll also see these pianos called used Japanese Yamahas or second-hand imports, which is how most people search for them. Whatever the name, it tells you where the piano has been. It doesn't tell you whether it's any good. Two pianos with the same model code can be very different instruments depending on how they were looked after.</p>

<h2>What Yamaha and Kawai in Australia say</h2>
<p>Both local distributors are cautious, and they're worth reading in their own words.</p>
<ul>
<li><strong>Yamaha Australia</strong> says most pre-loved Yamahas coming into the country were built for the Japanese market and may develop issues in our drier climate. It recommends having a technician inspect a pre-loved piano before you buy (<a href="https://au.yamaha.com/en/musical-instruments/pianos/explore/secondhand-faq/">Yamaha Australia, pre-owned piano FAQ</a>). Its piano warranty also excludes instruments imported from overseas (<a href="https://au.yamaha.com/en/support/warranty/piano/index.html">Yamaha Australia, piano warranty</a>).</li>
<li><strong>Kawai Australia</strong> says these pianos average 30 to 40 years old and often come from institutions (<a href="https://kawai.com.au/2019/08/26/what-is-a-grey-market-piano/">Kawai Australia, what is a grey market piano?</a>).</li>
</ul>
<p>These are fair points. It makes sense for a distributor to be careful about pianos it didn't supply and can't vouch for. The age point matters too. A 35-year-old piano can be lovely to play, but only if its hammers, strings and action have been looked after, and you deserve to know which kind you're looking at.</p>

<h2>The case for Japanese imports</h2>
<p>The other side comes from importers who have done this for a long time. One UK importer reports more than 3,800 pianos brought in from Japan since 2002, with no returns caused by humidity (<a href="https://markgoodwinpianos.co.uk/yamaha/grey-market-yamaha-pianos">Mark Goodwin Pianos</a>). That's the importer's own record, and the UK isn't Melbourne, so treat it as one useful data point rather than proof.</p>
<p>Melbourne buyers have been weighing this for years. In a 2021 forum thread, a local buyer with a $6,000 budget asked almost exactly the question in this article's title. The replies described shipping containers of about 40 randomly selected pianos, grey market uprights priced from $3,500 to $7,500 at the time, and the same advice from several people: have an independent technician look before you pay (<a href="https://forum.pianoworld.com/ubbthreads.php/topics/3072712/re-advice-on-grey-market-yamahas-melbourne-vic.html">Piano World forum, 2021</a>).</p>
<p>That word "randomly" is the real issue. A piano chosen on its own, by someone who has played it and looked inside it, is a different proposition from one that arrived as part of a mixed lot. That's why we don't buy in bulk from auction.</p>

<h2>Is Melbourne too dry for a piano built for Japan?</h2>
<p>This is the objection you'll hear most often. The numbers are worth a look, with one caution.</p>
<ul>
<li>Tokyo's mean relative humidity is about 65% across the year (<a href="https://www.data.jma.go.jp/obd/stats/etrn/view/nml_sfc_ym.php?prec_no=44&amp;block_no=47662&amp;year=&amp;month=&amp;day=&amp;view=">Japan Meteorological Agency</a>).</li>
<li>At Melbourne Airport, relative humidity at 3 pm averages about 44% in January and 65% in June (<a href="https://en.wikipedia.org/wiki/Climate_of_Melbourne">Bureau of Meteorology figures, via Wikipedia</a>).</li>
</ul>
<p>The two figures aren't measured the same way. Tokyo's is an average across the whole day and Melbourne's is a mid-afternoon reading, so you can't subtract one from the other and call it the difference.</p>
<p>What matters more is the air inside your home. Ducted heating through a Melbourne winter and a run of hot northerly days in summer can both dry a room out, and that's when any piano, whether it was built for Japan or for Australia, is most likely to drift out of tune. No piano is immune to that, and I'd be wary of anyone who told you theirs was.</p>
<p>The practical steps are simple. Keep the piano away from heating vents, fireplaces and direct sun, and have it tuned regularly, so a technician sees it often enough to catch small changes early. If you already own a piano and would like it looked over, see <a href="/services/tuning-servicing.html">tuning and servicing</a>.</p>

<h2>How old is it, and where has it been?</h2>
<p>Kawai Australia's point about age is worth taking seriously. A Yamaha's serial number tells you when it was made. On an upright you'll usually find it inside the top lid, on the frame or on the plate, and Yamaha publishes a guide to dating it (<a href="https://usa.yamaha.com/support/finding_age_of_yamaha_piano/index.html">Yamaha USA, finding the age of your piano</a>).</p>
<p>The serial dates the piano, and that's all it does. It won't tell you which market the piano was sold in, who owned it, or how it was kept. For that you need the seller's records, and it's fair to ask for them. Be careful with claims like "one owner" or "never a school piano" unless the seller can show you how they know. Containers often carry mixed lots, and a piano's history is hard to trace once it has changed hands a few times.</p>

<h2>What we do about each risk</h2>
<p>Here's how we handle each of the points above at Signature Pianos.</p>
<ul>
<li><strong>Chosen one at a time, in Japan.</strong> Every piano is inspected in Japan, by me or by partners who know what I look for, and photographed there before it's imported.</li>
<li><strong>Checked again in Melbourne.</strong> When a piano arrives it goes through our Mount Waverley workshop before it goes on the showroom floor. That's why some pianos show "price on request" while their workshop check is under way.</li>
<li><strong>A warranty from us, not from Yamaha.</strong> Yamaha Australia's warranty doesn't cover imported pianos, so we never suggest it does. Every piano we sell comes with a 10-year Signature Pianos warranty instead. It sits alongside your rights under the Australian Consumer Law and doesn't replace them (<a href="https://www.accc.gov.au/consumers/buying-products-and-services/warranties">ACCC, warranties</a>). The details are on our <a href="/services/delivery-warranty.html">delivery and warranty page</a>.</li>
<li><strong>A tuning once it has settled.</strong> A piano needs a few weeks to settle into a new room after a move, so your first tuning is included, three to four weeks after delivery.</li>
<li><strong>White-glove delivery you can follow.</strong> Delivery is booked and tracked in the customer portal, so you know when your piano is on its way.</li>
</ul>

<h2>Questions to ask before you buy any imported piano</h2>
<p>Whoever you buy from, these six questions will tell you a lot.</p>
<ol>
<li>What's the serial number, and what year does it give?</li>
<li>Where did the piano come from, and is that written down anywhere?</li>
<li>What work has been done since it arrived, and by whom?</li>
<li>Who backs the warranty: the dealer, the maker, or no one? For how long?</li>
<li>When is the first tuning after delivery, and is it included?</li>
<li>Can I take my time playing it, and bring a technician or my teacher along?</li>
</ol>
<p>If you're buying from a business, the consumer guarantees apply to pre-loved goods too. They don't apply to private sales (<a href="https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees">ACCC, consumer rights and guarantees</a>), which is worth weighing when a private listing costs less. Our <a href="/blog/second-hand-piano-checklist-melbourne">Melbourne buying checklist</a> goes through what to look and listen for once you're sitting at the piano.</p>

<h2>So, are they any good?</h2>
<p>A pre-loved Japanese Yamaha can be an excellent piano for a family, a student or an adult coming back to playing. It can also be a tired instrument with a well-known name on the fallboard. The label doesn't decide which. The piano does, along with the person who chose it and the work done before it reached you.</p>
<p>The simplest way to find out is to sit down and play. <a href="/services/book-a-viewing.html">Book a visit</a> to our showroom at 63 Blackburn Road, Mount Waverley, play as many pianos as you like, and bring every question on this page. You can see what's in stock now on our <a href="/instruments/">pianos page</a>.</p>$body$,
  ARRAY['Buying guide', 'Yamaha'],
  ARRAY['grey market yamaha piano', 'japanese grey market pianos', 'grey market piano meaning', 'used japanese yamaha piano', 'second hand yamaha piano melbourne'],
  $faq$[
  {
    "question": "What does grey market mean for a piano?",
    "answer": "It means the piano was made for and first sold in one country, then later imported into another by someone other than the maker's local distributor. For Yamaha and Kawai uprights in Australia, it usually means a piano built for Japan and brought here pre-loved. It describes the route the piano took, not its quality."
  },
  {
    "question": "Does a grey market Yamaha come with a Yamaha warranty?",
    "answer": "No. Yamaha Australia's piano warranty excludes instruments imported from overseas, so any warranty comes from the business that sells it to you. Every piano from Signature Pianos comes with a 10-year Signature Pianos warranty, which sits alongside your rights under the Australian Consumer Law."
  },
  {
    "question": "Will a piano from Japan cope with ducted heating?",
    "answer": "Any piano, wherever it was built, is affected by very dry air, and no one can honestly promise otherwise. Keep it away from heating vents, fireplaces and direct sun, and have it tuned regularly so small changes are caught early."
  },
  {
    "question": "How old are imported Japanese pianos?",
    "answer": "Kawai Australia says they average 30 to 40 years old. The serial number, usually inside the top lid or on the frame, gives the year the piano was made. Ask for it, and ask what work has been done since."
  },
  {
    "question": "Was it a school piano?",
    "answer": "Sometimes. Kawai Australia says many come from institutions, and shipping containers often carry mixed lots. Unless the seller has records, treat claims like \"one owner\" or \"never a school piano\" as unknown."
  },
  {
    "question": "Can I bring my own technician to look at a piano?",
    "answer": "Yes. Yamaha Australia recommends a technician's inspection before buying a pre-loved piano, and it's good advice wherever you buy. You're welcome to bring a technician or your teacher to a viewing at our Mount Waverley showroom."
  }
]$faq$::jsonb,
  'Eric Kuang', 'draft', 'manual'
)
ON CONFLICT (slug) DO NOTHING;

-- Yamaha U1 vs U3: which upright suits your home?
INSERT INTO blog_posts
  (slug, title, meta_description, excerpt, body_html, tags, keywords, faq, author, status, source)
VALUES (
  'yamaha-u1-vs-u3',
  'Yamaha U1 vs U3: which upright suits your home?',
  'Yamaha U1 vs U3 compared: height, weight, sound, model codes and price, so you can choose the right pre-loved upright for your room and budget.',
  'The U3 is about 10 cm taller, with longer strings and more bass. How to choose between Yamaha''s two classic uprights by room, sound and budget.',
  $body$<!-- VERIFY before publishing (for Eric):
1. "The two Yamaha uprights I bring back from Japan most often": confirm this still describes your stock.
2. New prices were taken from DW Music and Piano City listings in September 2026. Confirm they're current and GST-inclusive, and decide whether you're happy linking to other retailers (or swap in Yamaha Australia's RRP).
3. U1J made in Indonesia: the research lists it as Indonesian but gives no direct source. Confirm on Yamaha's spec page.
4. Width and depth aren't in the table on purpose. Add them only after checking Yamaha's spec sheet for the model years you stock.
5. YUS1 and YUS3 described as later models corresponding to the U1 and U3. Sources conflict on the YUS3's pedals, so the article doesn't mention them; keep it that way unless checked per piano.
6. AMEB Victoria's video-exam rule (digital up to Grade 4): recheck the page each year.
7. This links to /blog/grey-market-yamaha-pianos. Publish both drafts together, or remove the link.
8. Suggested hero photo: a real U1 or U3 from current stock, photographed in Japan.
-->
<p>The Yamaha U3 is the taller of the two: about 131 cm against the U1's 121 cm, with longer strings and a fuller bass. If you have the room and the budget, the U3 gives you more piano. If space is tight, or the piano is for a child who has just started, a good U1 is plenty. Either way, the condition of the particular piano matters more than the model.</p>
<p>These are the two Yamaha uprights I bring back from Japan most often, and "U1 or U3?" is the question I'm asked most in the showroom. Here's how I'd decide, by room, by sound and by budget.</p>

<h2>The U1 and U3 side by side</h2>
<table>
<thead><tr><th>&nbsp;</th><th>Yamaha U1</th><th>Yamaha U3</th></tr></thead>
<tbody>
<tr><td>Height</td><td>About 121 cm</td><td>About 131 cm</td></tr>
<tr><td>Weight</td><td>About 228 kg</td><td>About 235 kg</td></tr>
<tr><td>Strings</td><td>Shorter</td><td>Longer, with more bass</td></tr>
<tr><td>Suits</td><td>Smaller rooms, first years of lessons, tighter budgets</td><td>Rooms with space, students heading for higher grades</td></tr>
</tbody>
</table>
<p>Heights from <a href="https://churairatmusic.com/en/blog/2026/07/yamaha-u1h-u1m-u1a-u3h-u3m-u3a-differences">Churairat Music</a>; weights and strings from <a href="https://faustharrisonpianos.com/yamaha-u1-vs-u3-what-is-the-difference/">Faust Harrison Pianos</a>. All figures are approximate.</p>

<h2>Size: will it fit your room?</h2>
<p>Ten centimetres of height doesn't sound like much, but it can decide whether a piano sits under a window, a shelf or a painting. Measure the wall first, then the doorways, the hallway and any stairs between your front door and that wall. Wherever it goes, choose a spot away from heating vents, fireplaces and direct sun. Ducted heating dries a room out through a Melbourne winter, and that's when any piano, U1 or U3, is most likely to drift out of tune.</p>
<p>The weight difference is small. Both are well over 200 kg, which is why moving a piano is a job for people who do it every day. Ours is white-glove delivery, booked and tracked in the customer portal (<a href="/services/delivery-warranty.html">delivery and warranty</a>).</p>
<p>In a small room with hard floors, a U3 can feel big in sound as well as size. A rug and curtains soften a bright room. A technician can also voice the hammers, which means working the felt so the tone is a little rounder, but that's a fine adjustment rather than a way to turn a big piano into a small one.</p>

<h2>Sound: what the extra 10 centimetres gives you</h2>
<p>A taller upright has room for longer strings, and the longer bass strings are what give the U3 its fuller, deeper bottom end (<a href="https://faustharrisonpianos.com/yamaha-u1-vs-u3-what-is-the-difference/">Faust Harrison Pianos</a>). You'll hear it most in the lower octaves and when the piano is played loudly. For the pieces most students play in their first years, the difference is one of colour rather than capability.</p>
<p>Height also explains a comparison people don't expect. A UK specialist argues that a good upright around 130 cm tall beats a grand under five feet (<a href="https://markgoodwinpianos.co.uk/faq/baby-grand-vs-upright-piano">Mark Goodwin Pianos</a>). So if you've been weighing a U3 against a small grand for the same room, play both before assuming the grand wins.</p>

<h2>Reading the model codes: U3H, U3M, U3A and later</h2>
<p>Most pre-loved U1s and U3s carry a letter after the number. The letter marks the production era:</p>
<ul>
<li><strong>H:</strong> about 1972 to 1980</li>
<li><strong>M:</strong> 1980 to 1982</li>
<li><strong>A:</strong> 1982 to 1987</li>
</ul>
<p>Those dates are from <a href="https://churairatmusic.com/en/blog/2026/07/yamaha-u1h-u1m-u1a-u3h-u3m-u3a-differences">Churairat Music</a>. Later came the U30 series, made from 1988 to 1994, and the YU3 and YU30, made from 1997 to 2004 (<a href="https://markgoodwinpianos.co.uk/yamaha/difference-u3-u30a-u30bl-yu30-ux-ux3-yu3s-yu3sxg-yu5sxg-yua">Mark Goodwin Pianos</a>).</p>
<p>The important thing is what the code doesn't tell you. A U3H from the 1970s that has been well kept and properly regulated can play better than a newer piano that hasn't. Regulation is the adjustment of the action, the thousands of small parts between key and hammer, so that every key feels and responds the same. The code gives you the era. Only playing the piano, and looking inside it, tells you its condition.</p>

<h2>The cousins: YUS, UX and W series</h2>
<p>You'll see a few related models in listings, and it helps to know where they sit.</p>
<ul>
<li><strong>YUS1 and YUS3.</strong> Later Yamaha models that correspond to the U1 and U3. If you like the idea of a U1 or U3 but want a newer piano, they're worth playing too.</li>
<li><strong>UX.</strong> A 131 cm upright with an X-shaped brace across the back (<a href="https://markgoodwinpianos.co.uk/yamaha/difference-u3-u30a-u30bl-yu30-ux-ux3-yu3s-yu3sxg-yu5sxg-yua">Mark Goodwin Pianos</a>).</li>
<li><strong>W series.</strong> 131 cm models in wood cabinets, voiced for a darker tone (<a href="https://markgoodwinpianos.co.uk/yamaha/yamaha-w102b-upright-piano-review">Mark Goodwin Pianos</a>).</li>
</ul>
<p>A newer or longer model code isn't automatically a better piano. Play them side by side and let your ears decide.</p>

<h2>Budget: what they cost new, and where pre-loved fits</h2>
<p>New prices are a useful reference. In September 2026, Australian retailers advertised:</p>
<ul>
<li>Yamaha U1J: $7,299 to $7,999 (<a href="https://dwmusic.com.au/collections/yamaha-u-series-upright-pianos">DW Music</a>)</li>
<li>Yamaha U1PEQ: $11,299 to $12,499 (<a href="https://dwmusic.com.au/collections/yamaha-u-series-upright-pianos">DW Music</a>)</li>
<li>Yamaha U3PEQ, polished ebony: $16,499 (<a href="https://pianocity.com.au/product/yamaha-u3peq-upright-piano-polished-ebony/">Piano City</a>)</li>
</ul>
<p>The U1J is built in Indonesia. If where a piano was built matters to you, check the serial number or the maker's stamp on any piano, new or pre-loved, rather than assuming.</p>
<p>A pre-loved U1 or U3 usually costs less than the new pianos above, with the price depending on its age, its condition and the work done on it. Our current pianos are on the <a href="/instruments/">pianos page</a>; some show "price on request" while they finish their workshop check.</p>
<p>Whichever you choose, budget for regular tuning. A Melbourne technician put a tuning at $200 to $350 in 2026 (<a href="https://flowpiano.com.au/blog/20260517%20-%20Piano%20tuning%20cost%20Melbourne?lang=en">Flow Piano</a>). With us, your first tuning is included, three to four weeks after delivery, and every piano comes with a 10-year Signature Pianos warranty.</p>

<h2>U1 or U3 for a child who has just started?</h2>
<p>Either is a proper instrument to learn on, and both will take a student a long way. I'd lean towards a U1 if the room is small or the budget is stretched, and a U3 if there's space and the family expects to stay with the piano for years. A well-kept U1 is a better choice than a tired U3.</p>
<p>For exams, the question that matters is acoustic or digital, not U1 or U3. For exams by video, AMEB Victoria allows digital pianos only up to Grade 4 (<a href="https://ameb.vic.edu.au/practical-information/exams-by-video/">AMEB Victoria</a>). The U1 and U3 are both full-size acoustic uprights, so that limit doesn't apply to either. Rules change and differ between states, so check the current syllabus with your teacher. If you don't have one yet, you can <a href="/teachers.html">find a teacher near you</a>.</p>

<h2>Play both side by side</h2>
<p>Reading about sound only goes so far. In the showroom you can play a U1 and a U3 one after the other, and often a YUS or W series too, depending on what has come in from Japan.</p>
<h3>How to compare them fairly</h3>
<ul>
<li>Play the same piece on both, something you know well enough not to think about the notes.</li>
<li>Play the lowest octave on each, then a few quiet chords in the middle. The bass is where they differ most; the quiet chords show how evenly each one has been regulated.</li>
<li>Ask for the serial number and year of each piano, and what work has been done on it in the workshop.</li>
<li>If the piano is for a child, have them play both. They're the one who'll sit at it every day.</li>
<li>Notice which one you keep going back to. That's usually your answer.</li>
</ul>
<p>Every piano comes with white-glove delivery, tracked in the customer portal, a 10-year Signature Pianos warranty and your first tuning included three to four weeks after delivery. <a href="/services/book-a-viewing.html">Book a visit</a> and mention you'd like to compare a U1 and a U3. If you're wondering about imported pianos in general, our <a href="/blog/grey-market-yamaha-pianos">guide to grey market Yamahas</a> covers what the local distributors say.</p>$body$,
  ARRAY['Yamaha', 'Buying guide'],
  ARRAY['yamaha u1 vs u3', 'yamaha u3 dimensions', 'u1 or u3 yamaha piano', 'yamaha u3 weight', 'yamaha u3h vs u3m', 'pre-loved yamaha u3 melbourne'],
  $faq$[
  {
    "question": "Is the Yamaha U3 worth the extra over a U1?",
    "answer": "If you have the space and plan to play for years, often yes: the U3's longer strings give a fuller bass. But condition matters more than model. A well-kept U1 is a better buy than a tired U3, so play both before deciding."
  },
  {
    "question": "Is a U3 too loud for a small room?",
    "answer": "It can feel big in a small room with hard floors. A rug and curtains soften the sound, and a technician can voice the hammers to round the tone a little. If the room is very small, a U1 may simply suit it better."
  },
  {
    "question": "Which is better for AMEB exams, the U1 or the U3?",
    "answer": "Either. Both are full-size acoustic uprights. For exams by video, AMEB Victoria allows digital pianos only up to Grade 4, so the distinction that matters is acoustic or digital. Check the current rules with your teacher, as they change."
  },
  {
    "question": "Should a beginner start on a U1 or a U3?",
    "answer": "Either works. A U1 suits a smaller room or budget and takes a student a long way; a U3 gives more room to grow. Choose the better-kept piano over the bigger model."
  },
  {
    "question": "What about the new Yamaha U1J?",
    "answer": "The U1J was advertised new at $7,299 to $7,999 in September 2026 and is built in Indonesia. Compare it with a pre-loved U1 or U3 by playing them, and check the serial or stamp on any piano if where it was built matters to you."
  }
]$faq$::jsonb,
  'Eric Kuang', 'draft', 'manual'
)
ON CONFLICT (slug) DO NOTHING;

-- Buying a second-hand piano in Melbourne: a checklist
INSERT INTO blog_posts
  (slug, title, meta_description, excerpt, body_html, tags, keywords, faq, author, status, source)
VALUES (
  'second-hand-piano-checklist-melbourne',
  'Buying a second-hand piano in Melbourne: a checklist',
  'Buying a second-hand piano in Melbourne? What to play, what to look at inside, what to ask and which rights apply, before you pay.',
  'What to play, what to look at inside and what to ask before you pay for a pre-loved piano in Melbourne. A checklist you can take to any viewing.',
  $body$<!-- VERIFY before publishing (for Eric):
1. The invitation to bring a technician or teacher to a viewing: confirm you're happy to offer it.
2. Prices quoted from other businesses (Flow Piano tuning $200 to $350, Harry the Piano Mover $260 to $420, Piano Doctor appraisal about $180 + GST): recheck the live pages before publishing, as they change.
3. Serial number reference points (Mark Goodwin): recheck the table before publishing.
4. Yamaha Australia's technician recommendation came from a search snippet; check the live page.
5. "What happens at a Signature viewing" follows the wording on the book-a-viewing page. Adjust it if the visit has changed.
6. This links to /blog/grey-market-yamaha-pianos and /blog/yamaha-u1-vs-u3. Publish the three drafts together, or remove those links.
-->
<p>Play it, look inside it, and know who stands behind it. That's the short version of buying a pre-loved piano, or a second-hand piano as most people search for it. Most pre-loved Yamahas for sale in Australia were built for the Japanese market (<a href="https://au.yamaha.com/en/musical-instruments/pianos/explore/secondhand-faq/">Yamaha Australia</a>), and the checks below apply whether you're looking at a dealer's floor, a private listing or our showroom in Mount Waverley.</p>
<p>Our pianos are chosen in Japan, by me or by partners who know what I look for, and checked again in our workshop when they arrive, so this list is what we look for too. Print it, or keep it open on your phone while you play.</p>

<h2>Before you go</h2>
<h3>Set a budget that includes the extras</h3>
<p>The price of the piano isn't the whole cost. In 2026 a Melbourne technician put a tuning at $200 to $350 (<a href="https://flowpiano.com.au/blog/20260517%20-%20Piano%20tuning%20cost%20Melbourne?lang=en">Flow Piano</a>), and one piano mover's published rates for a move ran from $260 to $420 (<a href="https://www.harrythepianomover.com.au/">Harry the Piano Mover</a>). Ask what's included in the price you're quoted. With us, delivery is white-glove and tracked in the customer portal, and your first tuning is included, three to four weeks after delivery.</p>
<h3>Measure the room and the way in</h3>
<p>Measure the wall where the piano will go, then the doorways, the hallway and any stairs on the way there. Uprights are heavy: a Yamaha U1 weighs about 228 kg and a U3 about 235 kg (<a href="https://faustharrisonpianos.com/yamaha-u1-vs-u3-what-is-the-difference/">Faust Harrison Pianos</a>). Heights run from about 121 cm for a U1 to about 131 cm for a U3 (<a href="https://churairatmusic.com/en/blog/2026/07/yamaha-u1h-u1m-u1a-u3h-u3m-u3a-differences">Churairat Music</a>). If you're choosing between those two, our <a href="/blog/yamaha-u1-vs-u3">U1 vs U3 guide</a> goes into the differences.</p>
<h3>Bring the person who'll play it</h3>
<p>If the piano is for a child, bring them along. They're the one who'll sit at it every day, and how the keys feel under their hands matters as much as how the piano sounds to you.</p>
<h3>Dealer or private seller?</h3>
<p>This choice changes your rights. When you buy from a business, the consumer guarantees under the Australian Consumer Law apply, pre-loved goods included. When you buy privately, they don't (<a href="https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees">ACCC, consumer rights and guarantees</a>). A private sale can still be a good piano, but if something turns out to be wrong after you've paid, you have much less to fall back on.</p>

<h2>At the piano: what to check</h2>
<p>Give yourself time. A good seller will expect you to play for a while and won't hurry you.</p>
<h3>Play every key, softly and loudly</h3>
<ul>
<li>Play each note from the bottom of the keyboard to the top, first softly, then loudly. The response should feel even, with no keys that are noticeably heavier, lighter or slower to come back up (<a href="https://forum.pianoworld.com/ubbthreads.php/topics/3072712/re-advice-on-grey-market-yamahas-melbourne-vic.html">Piano World forum</a>).</li>
<li>Listen for buzzing, rattles or clicks. Some are simple to fix and some point to wear. Either way, ask about them.</li>
<li>Play something you know well, and some quiet chords. A piano that sounds fine loudly but feels uneven when you play softly is telling you about its regulation: how the action has been adjusted so every key behaves the same way.</li>
<li>Try each pedal, and listen for squeaks or thumps.</li>
</ul>
<h3>Look inside</h3>
<p>Ask the seller to open the lid and the front panel. You don't need to be a technician to notice the basics.</p>
<ul>
<li><strong>Hammers.</strong> The felt-covered heads that strike the strings. Deep grooves or flattened tops are signs of wear (<a href="https://forum.pianoworld.com/ubbthreads.php/topics/3072712/re-advice-on-grey-market-yamahas-melbourne-vic.html">Piano World forum</a>).</li>
<li><strong>Strings and tuning pins.</strong> The pins are what the strings wrap around at the top. Heavy rust, or pins that look out of line with their neighbours, are worth asking about.</li>
<li><strong>Bridges and soundboard.</strong> The soundboard is the large wooden panel behind the strings, and the bridges carry the strings' vibration into it. Cracks in either are a question for a technician (<a href="https://forum.pianoworld.com/ubbthreads.php/topics/3480953/ok-to-buy-a-40-year-old-paino.html">Piano World forum</a>).</li>
<li><strong>Keys and case.</strong> Chipped keytops, a fallboard that drops hard or loose hinges are worth noting and asking about. They also tell you something about how the piano has been treated.</li>
</ul>
<h3>Check its age</h3>
<p>On a Yamaha upright the serial number is usually inside the top lid, on the frame or on the plate (<a href="https://usa.yamaha.com/support/finding_age_of_yamaha_piano/index.html">Yamaha USA</a>). One specialist's table gives these reference points for Yamahas built in Japan: around 978000 in 1970, 3001000 in 1980, 4811000 in 1990, 5868000 in 2000 and 6280000 in 2010 (<a href="https://markgoodwinpianos.co.uk/yamaha/yamaha-piano-serial-numbers">Mark Goodwin Pianos</a>). Kawai uses its own system, and Kawai Australia explains where to find the serial and how to date it (<a href="https://kawai.com.au/2022/09/20/when-was-your-kawai-piano-made/">Kawai Australia</a>).</p>
<p>The serial dates the piano. It doesn't tell you how the piano was kept or which market it was first sold in.</p>
<h3>Ask about its history</h3>
<ul>
<li>Where did it come from, and is that written down anywhere?</li>
<li>What work has been done since it arrived, such as tuning, regulation or new parts, and who did it?</li>
<li>If it has a silent system, which lets you play through headphones, is it Yamaha's own factory SILENT system or one added later?</li>
<li>Be careful with "one owner" or "never a school piano" unless the seller can show you how they know.</li>
</ul>

<h2>Should you bring a technician?</h2>
<p>If you're not sure what you're hearing, yes. Yamaha Australia recommends having a technician inspect a pre-loved piano before you buy (<a href="https://au.yamaha.com/en/musical-instruments/pianos/explore/secondhand-faq/">Yamaha Australia</a>), and Melbourne buyers on piano forums keep giving the same advice (<a href="https://forum.pianoworld.com/ubbthreads.php/topics/3072712/re-advice-on-grey-market-yamahas-melbourne-vic.html">Piano World forum</a>, <a href="https://forums.whirlpool.net.au/archive/2676240">Whirlpool forums</a>). One technician's published price for an independent appraisal was about $180 plus GST in September 2026 (<a href="https://www.pianodoctor.com.au/pricing.html">Piano Doctor</a>).</p>
<p>A teacher helps in a different way. If your child already has one, they know how a piano should feel under a student's hands, and they know your child. You're welcome to bring either to a viewing with us.</p>

<h2>What happens at a Signature viewing</h2>
<p>You book a private viewing at our showroom at 63 Blackburn Road, Mount Waverley, and play as many pianos as you like. We'll walk you through each one: its history, the restoration and workshop work done on it, its regulation and its touch. Every piano on the floor was chosen in Japan and checked in our workshop before it got there, and you can bring this checklist and use every line of it.</p>

<h2>After you buy</h2>
<ul>
<li><strong>Delivery.</strong> White-glove delivery, booked and tracked in the customer portal, so you know when your piano is on its way.</li>
<li><strong>The first tuning.</strong> A piano needs time to settle after a move, and the usual advice is to wait somewhere between two and eight weeks before tuning (<a href="https://www.movinghelp.com/move/when-to-tune-piano-after-moving/">Moving Help</a>). Your first tuning with us is included, three to four weeks after delivery.</li>
<li><strong>The warranty.</strong> A 10-year Signature Pianos warranty, which sits alongside your rights under the Australian Consumer Law rather than replacing them. Details are on our <a href="/services/delivery-warranty.html">delivery and warranty page</a>.</li>
<li><strong>Where it lives.</strong> Keep it away from heating vents, fireplaces and direct sun, and book regular tuning (<a href="/services/tuning-servicing.html">tuning and servicing</a>).</li>
</ul>

<h2>The checklist in one place</h2>
<ul>
<li>Budget covers delivery and tuning</li>
<li>Room, doorways and stairs measured</li>
<li>Dealer or private: you know which rights apply</li>
<li>Every key played softly and loudly, and the response is even</li>
<li>No unexplained buzzing, rattles or sticking keys</li>
<li>Every pedal tried</li>
<li>Hammers, strings, tuning pins, bridges and soundboard looked at</li>
<li>Serial number found and dated</li>
<li>History, work done and any silent system explained</li>
<li>Warranty: who backs it, and for how long</li>
<li>First tuning: when, and whether it's included</li>
<li>A technician's or teacher's opinion, if you're unsure</li>
</ul>
<p>When you're ready to try it on real pianos, <a href="/services/book-a-viewing.html">book a visit</a>, or see <a href="/instruments/">what's in the showroom now</a>. For more on imported Yamahas in particular, read our <a href="/blog/grey-market-yamaha-pianos">guide to grey market Yamaha pianos</a>.</p>$body$,
  ARRAY['Buying guide', 'Melbourne'],
  ARRAY['second hand pianos melbourne', 'used pianos for sale melbourne', 'piano dealers melbourne', 'buying a second hand piano checklist', 'what to look for when buying a used piano'],
  $faq$[
  {
    "question": "What should I check when buying a pre-loved piano?",
    "answer": "Play every key softly and loudly and listen for an even response. Listen for buzzing or rattles, try the pedals, and look at the hammers, strings, tuning pins, bridges and soundboard. Find the serial number to date it, and ask what work has been done."
  },
  {
    "question": "Should I bring a technician to look at a piano?",
    "answer": "If you're unsure what you're hearing, yes. Yamaha Australia recommends a technician's inspection before buying a pre-loved piano, and one technician listed an independent appraisal at about $180 plus GST in September 2026. You're welcome to bring a technician or your teacher to a viewing with us."
  },
  {
    "question": "Is it better to buy from a dealer or a private seller?",
    "answer": "Consumer guarantees under the Australian Consumer Law cover pre-loved goods bought from a business, but not private sales. A private piano can still be a good one, but you have fewer protections if something goes wrong."
  },
  {
    "question": "How long should I spend playing a piano before buying it?",
    "answer": "Long enough to play every note softly and loudly, try the pedals and play a piece you know. If you're buying for a child, have them play it too. A seller shouldn't hurry you."
  },
  {
    "question": "When should a piano be tuned after delivery?",
    "answer": "The usual advice is to let it settle for two to eight weeks after a move. At Signature Pianos, your first tuning is included three to four weeks after delivery."
  }
]$faq$::jsonb,
  'Eric Kuang', 'draft', 'manual'
)
ON CONFLICT (slug) DO NOTHING;

-- Mark the matching topics in the plan as used (skipped if blog_topic_plan.sql
-- hasn't been run yet; that file links them itself when it runs).
DO $link$
BEGIN
  IF to_regclass('public.blog_topic_queue') IS NOT NULL THEN
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
  END IF;
END
$link$;

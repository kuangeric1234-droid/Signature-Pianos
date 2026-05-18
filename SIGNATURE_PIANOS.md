# SIGNATURE PIANOS — Claude Code Project Brief
> Drop this file in your project root. Start every Claude Code session by saying: "Read SIGNATURE_PIANOS.md before we begin."

---

## 1. BUSINESS OVERVIEW

**Business name:** Signature Pianos
**Location:** Melbourne, Victoria, Australia
**Website:** signaturepianos.com.au
**Tagline:** *Find the piano that moves you.*

Signature Pianos is Melbourne's most modern piano business. It sells new and pre-loved acoustic and digital pianos, connects buyers with piano teachers, and provides ongoing post-sale support — all through a beautifully designed digital experience that no competitor in Melbourne currently offers.

**The core promise:** Making buying, learning, and owning a piano the easiest and most enjoyable experience in Melbourne.

---

## 2. TARGET AUDIENCE

There are four main buyer types. Design and copy decisions should always serve these people.

### Primary (highest volume)
**Parents buying for a child starting lessons**
- Age: 35–50
- Not piano experts — need guidance, not jargon
- Anxious about making the wrong decision
- Budget: $1,500–$5,000
- Device: mostly mobile, often browsing at night
- Needs: reassurance, clear recommendations, easy next step

**Adult returners**
- Age: 35–55, professionals
- Played piano as a child, want to get back into it
- Will research properly, responds to quality signals
- Budget: $4,000–$12,000
- Needs: trust, product quality information, no pressure

### Secondary
**Serious students / conservatorium buyers**
- Age: 18–30, deeply informed
- Know exactly what they want — brand, model, specs
- Budget: $5,000–$20,000+
- Needs: detailed specs, comparison tools, professional credibility

**Gifters**
- Buying a piano as a significant life gift
- Emotionally driven, new to the piano world
- Budget: flexible
- Needs: curated guidance, gift-friendly presentation

---

## 3. BRAND & AESTHETIC

### The feel
Dark, warm, premium. Like walking into a beautifully designed Melbourne showroom — hushed, considered, impressive without being intimidating. Luxury but human. Informative but never boring.

**Not:** stuffy like Steinway, generic like a music shop, over-the-top like an agency portfolio, cold or corporate.
**Yes:** confident, warm, trustworthy, a little cinematic.

### Colour palette
```
Background (primary):    #0e0e0d   /* Near-black, warm undertone */
Background (secondary):  #1a1a18   /* Dark charcoal cards */
Background (tertiary):   #242422   /* Slightly lighter sections */
Accent gold:             #b8935a   /* Warm amber gold — main brand colour */
Accent gold light:       #d4b483   /* Lighter gold for hover states */
Text primary:            #f5f0e8   /* Warm ivory white */
Text secondary:          #9a9590   /* Muted warm grey */
Text tertiary:           #6b6760   /* Subtle labels */
Border:                  rgba(184, 147, 90, 0.15)  /* Gold tinted borders */
Border hover:            rgba(184, 147, 90, 0.4)   /* On hover */
```

### Typography
```
Display / headlines:  'Cormorant Garamond', serif
                      — weights: 300 (light), 400 (regular)
                      — use italic for warmth and elegance
                      — large sizes: 56–80px desktop, 36–48px mobile

Body / UI:            'DM Sans', sans-serif
                      — weights: 300, 400, 500
                      — body text: 14–15px, line-height 1.7
                      — labels: 10–11px, letter-spacing 0.12–0.25em

Google Fonts import:
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');
```

### Spacing & layout
- Max content width: 1200px, centred
- Section padding: 80–100px vertical on desktop, 48–60px mobile
- Generous white space — never crowd elements
- Grid: 12-column, gap 24px
- Border radius: 4px for cards, 0px for buttons (sharp edges = premium)

### Photography direction (for placeholder/real images)
- Dark studio lighting — pianos lit like sculptures
- Close-up details: keys, wood grain, hammers, pedals
- Lifestyle: hands on keys, warm ambient room lighting
- Never: showroom floor overhead shots, white backgrounds, stock music imagery
- Mood reference: B&B Italia furniture photography, Macallan whisky campaigns

---

## 4. WEBSITE STRUCTURE

### Pages to build (in order)
1. **Homepage** — hero, piano matcher, featured pianos, features, testimonials, footer
2. **Instruments** — full piano catalogue with filters
3. **Piano Finder** — full quiz flow page
4. **Individual Piano** — product detail page
5. **Piano Teachers** — teacher directory + matching
6. **About** — story, showroom, team
7. **Contact / Book a Visit** — form + map
8. **Customer Portal** — post-sale hub (logged-in state)

### Navigation structure
```
Logo | Instruments | Find My Piano | Teachers | Our Story | [Book a Visit CTA]
```
- Nav: transparent over hero, dark background on scroll
- Mobile: hamburger menu, full-screen overlay
- CTA button: gold border, gold text, sharp corners

---

## 5. HOMEPAGE SECTIONS (detailed)

### 5.1 Navigation
- Sticky, transparent at top
- Transitions to `background: rgba(14,14,13,0.95)` with `backdrop-filter: blur(12px)` on scroll
- Logo: "Signature" in Cormorant Garamond light, "Pianos" in gold
- Links: 12px DM Sans, letter-spacing 0.1em, warm grey, white on hover
- CTA: "Book a visit" — gold border button, top right

### 5.2 Hero Section
**The signature moment of the site.**

Layout: Full viewport height. Two columns on desktop — left: headline + CTA, right: animated piano illustration. On mobile: stacked, headline above keys.

Copy:
```
Eyebrow:   MELBOURNE'S PIANO HOUSE
H1:        Find the piano
           that moves you.
           (italic "moves" in gold)
Subtext:   From first lesson to concert hall. We match every
           buyer to the perfect instrument — with expert
           guidance, not sales pressure.
CTA 1:     [Find my piano]  ← gold filled button
CTA 2:     Explore instruments →  ← text link
```

**Interactive piano keys:**
- Full-width row of playable piano keys at the bottom of the hero or mid-hero
- White keys: warm ivory (`#f0ece0`), black keys: near-black (`#1a1a18`)
- On hover: key depresses slightly (CSS transform scaleY + translateY)
- On click/tap: key lights up in gold, plays the corresponding musical note using Web Audio API (triangle or sine oscillator with quick decay envelope)
- Auto-plays a short welcoming melody on page load (gentle, 6–8 notes, C major scale or simple chord)
- Note names float up as bubbles when keys are played
- On mobile: touch-enabled, keys slightly wider for fat fingers

**Scroll indicator:** Animated down-chevron or "scroll to explore" text, fades out after first scroll

### 5.3 Piano Finder / Matcher
**The most valuable feature on the site.**

Layout: Dark card (`#1a1a18`), full-width section

Header:
```
Label:    INTELLIGENT MATCHING
H2:       Answer 3 questions.
          Find your perfect piano.
Body:     Our AI-powered finder asks about your skill level,
          space, and budget — then matches you to instruments
          in our live inventory.
```

Step indicator: Three numbered steps shown as cards
```
01 — Your level      (Beginner through professional)
02 — Your space      (Room size and acoustic needs)
03 — Your budget     (We have options at every level)
```
Active step highlighted in gold border + subtle gold background tint

Input row: Three `<select>` dropdowns side by side
```
Dropdown 1 — Skill level:
  "I'm just starting out"
  "I've been playing a few years"
  "I'm a serious student"
  "I'm a professional"

Dropdown 2 — Space:
  "Small apartment"
  "Medium sized room"
  "Large living area"
  "Studio or venue"

Dropdown 3 — Budget:
  "Under $3,000"
  "$3,000 – $8,000"
  "$8,000 – $20,000"
  "$20,000+"
```

Find Match button: Gold filled, "Find my match →"

**Result popup animation:**
After clicking Find Match, a beautiful card slides up from the bottom (or fades in from centre):
- Dark card with gold border
- "Matched for you" label in gold
- Piano name in Cormorant Garamond italic
- Brief reason why ("Perfect for a medium room, ideal for serious students")
- Price range
- "View this piano →" CTA
- "See all matches" secondary link
- Background dims with overlay

### 5.4 Featured Instruments
Layout: 3-column card grid on desktop, 1-column on mobile

Section header:
```
Label:  OUR COLLECTION
H2:     Pianos for every journey
Body:   New, pre-loved, acoustic and digital — curated
        for Melbourne homes and studios.
```

Piano card design:
```
- Dark card (#1a1a18)
- Image area: 200px tall, dark bg with piano photo
- Gold category tag: "Grand Piano" / "Upright" / "Digital"
- Piano name in Cormorant Garamond
- Brand + model in DM Sans
- Price: "From $X,XXX"
- Border: 0.5px gold-tinted
- Hover: border brightens, card lifts 4px (transform translateY(-4px))
- Hover: subtle 3D tilt effect (CSS perspective transform, max 8deg)
- Transition: all 0.3s ease
```

Categories to show:
1. Grand Pianos — "Concert & salon grands" — From $18,000
2. Upright Pianos — "Yamaha, Kawai & more" — From $4,200
3. Digital Pianos — "Roland, Kawai & Casio" — From $899

"View full collection →" link below grid

### 5.5 Why Signature Pianos (Features Grid)
Layout: 2x2 grid, alternating dark sections

Features:
```
1. AI Piano Matching
   Icon: sparkles/brain
   "Answer 3 questions. Our AI matches you to in-stock
   pianos based on your level, space, and budget —
   no pushy upsells."

2. Post-Sale Care Hub
   Icon: calendar/shield
   "Book tuning, get care reminders, and access your
   piano's full history — all from your personal
   owner dashboard."

3. Piano Teacher Matching
   Icon: users
   "Once you have your piano, we connect you with
   verified Melbourne teachers matched to your
   style and goals."

4. White-Glove Delivery
   Icon: truck/star
   "Professional delivery and in-home placement
   anywhere in greater Melbourne. Followed by a
   complimentary first tuning."
```

### 5.6 Sound Preview Strip (optional but great)
A horizontal strip showing 3–4 piano models with:
- Piano name
- "▶ Hear it" play button
- Animated sound wave that pulses while audio plays
- Short 10-second audio clip of each piano

### 5.7 Testimonials
Layout: 3 cards in a row, or carousel on mobile

```
"The matching tool sent me straight to the right piano.
I was in and out in 40 minutes with a Kawai I love."
— Sarah M., Fitzroy

"No other piano shop in Melbourne feels this modern.
They even matched me to a teacher the same week."
— James T., South Yarra

"The post-sale portal is genuinely useful. My tuning
reminders just appear — I've never missed one."
— Elena K., Brunswick
```

Style: Left gold border, italic quote in Cormorant Garamond, name in small DM Sans

### 5.8 CTA Banner
Full-width dark section, centred:
```
H2:   Ready to find your piano?
Sub:  Come into our Melbourne showroom or start online.
      No pressure. Just great pianos and honest advice.
CTA:  [Book a showroom visit]
```

### 5.9 Footer
```
Left:   Signature Pianos wordmark + tagline
Centre: Nav links (Instruments, Find My Piano, Teachers, About, Contact)
Right:  Address (Melbourne VIC) + phone + email + social icons

Bottom bar: © 2025 Signature Pianos · Privacy Policy · Terms
```

---

## 6. ANIMATION SPECIFICATIONS

Use **GSAP** (GreenSock) for all scroll animations. Load from CDN:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>
```

### 6.1 Scroll reveal (apply to every section)
```javascript
gsap.registerPlugin(ScrollTrigger);

// Standard reveal — apply to all .reveal elements
gsap.utils.toArray('.reveal').forEach(el => {
  gsap.fromTo(el,
    { opacity: 0, y: 40 },
    {
      opacity: 1, y: 0, duration: 0.9, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' }
    }
  );
});

// Stagger reveal for grids
gsap.utils.toArray('.reveal-stagger').forEach(container => {
  gsap.fromTo(container.children,
    { opacity: 0, y: 30 },
    {
      opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: 'power2.out',
      scrollTrigger: { trigger: container, start: 'top 80%' }
    }
  );
});
```

### 6.2 Hero headline typewriter / fade
```javascript
// Fade in headline words one by one on load
gsap.timeline({ delay: 0.3 })
  .fromTo('.hero-eyebrow', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 })
  .fromTo('.hero-h1', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.2')
  .fromTo('.hero-sub', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
  .fromTo('.hero-btns', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.3');
```

### 6.3 Interactive piano keys (Web Audio API)
```javascript
// Full implementation — playable keys in hero
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

const noteFrequencies = {
  'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
  'G4': 392.00, 'A4': 440.00, 'B4': 493.88, 'C5': 523.25,
  'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99,
  'C#4': 277.18, 'D#4': 311.13, 'F#4': 369.99,
  'G#4': 415.30, 'A#4': 466.16, 'C#5': 554.37,
  'D#5': 622.25, 'F#5': 739.99
};

function playNote(note, keyEl) {
  const ctx = initAudio();
  const freq = noteFrequencies[note];
  if (!freq) return;

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.value = 2000;

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 1.5);

  // Visual feedback
  keyEl.classList.add('key-active');
  setTimeout(() => keyEl.classList.remove('key-active'), 300);

  // Note bubble
  showNoteBubble(note.replace(/\d/, ''), keyEl);
}

function showNoteBubble(noteName, keyEl) {
  const bubble = document.createElement('div');
  bubble.className = 'note-bubble';
  bubble.textContent = noteName;
  keyEl.appendChild(bubble);
  gsap.fromTo(bubble,
    { opacity: 1, y: 0 },
    { opacity: 0, y: -30, duration: 0.8, ease: 'power2.out',
      onComplete: () => bubble.remove() }
  );
}

// Welcome melody on load — plays after 1 second
const welcomeMelody = [
  { note: 'C4', delay: 1000 }, { note: 'E4', delay: 1300 },
  { note: 'G4', delay: 1600 }, { note: 'C5', delay: 1900 },
  { note: 'G4', delay: 2400 }, { note: 'E4', delay: 2700 },
  { note: 'C4', delay: 3100 }
];

welcomeMelody.forEach(({ note, delay }) => {
  setTimeout(() => {
    const keyEl = document.querySelector(`[data-note="${note}"]`);
    if (keyEl) playNote(note, keyEl);
  }, delay);
});
```

### 6.4 Custom cursor
```javascript
// Custom cursor — desktop only
if (window.matchMedia('(pointer: fine)').matches) {
  const cursor = document.querySelector('.cursor');
  const cursorRing = document.querySelector('.cursor-ring');

  window.addEventListener('mousemove', e => {
    gsap.to(cursor, { x: e.clientX, y: e.clientY, duration: 0 });
    gsap.to(cursorRing, { x: e.clientX, y: e.clientY, duration: 0.15 });
  });

  document.querySelectorAll('a, button, .piano-card, .wkey, .bkey').forEach(el => {
    el.addEventListener('mouseenter', () => {
      gsap.to(cursorRing, { scale: 1.8, opacity: 0.4, duration: 0.3 });
    });
    el.addEventListener('mouseleave', () => {
      gsap.to(cursorRing, { scale: 1, opacity: 1, duration: 0.3 });
    });
  });
}
```

```css
/* Cursor CSS */
* { cursor: none; }
.cursor {
  width: 6px; height: 6px;
  background: #b8935a;
  border-radius: 50%;
  position: fixed;
  top: 0; left: 0;
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
}
.cursor-ring {
  width: 28px; height: 28px;
  border: 1px solid rgba(184, 147, 90, 0.5);
  border-radius: 50%;
  position: fixed;
  top: 0; left: 0;
  pointer-events: none;
  z-index: 9998;
  transform: translate(-50%, -50%);
}
```

### 6.5 Product card 3D tilt
```javascript
document.querySelectorAll('.piano-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    gsap.to(card, {
      rotationY: x * 10,
      rotationX: -y * 10,
      transformPerspective: 800,
      ease: 'power1.out',
      duration: 0.4
    });
  });
  card.addEventListener('mouseleave', () => {
    gsap.to(card, { rotationY: 0, rotationX: 0, duration: 0.5, ease: 'power2.out' });
  });
});
```

### 6.6 Piano matcher result popup
```javascript
function showMatchResult(piano) {
  const popup = document.querySelector('.match-result-popup');
  document.querySelector('.popup-piano-name').textContent = piano.name;
  document.querySelector('.popup-reason').textContent = piano.reason;
  document.querySelector('.popup-price').textContent = piano.price;
  document.querySelector('.overlay').classList.add('active');

  gsap.fromTo(popup,
    { opacity: 0, y: 60, scale: 0.95 },
    { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' }
  );
}
```

### 6.7 Navbar scroll behaviour
```javascript
ScrollTrigger.create({
  start: 'top -80',
  onEnter: () => document.querySelector('nav').classList.add('scrolled'),
  onLeaveBack: () => document.querySelector('nav').classList.remove('scrolled'),
});
```
```css
nav { transition: background 0.3s ease, backdrop-filter 0.3s ease; }
nav.scrolled {
  background: rgba(14, 14, 13, 0.95);
  backdrop-filter: blur(12px);
}
```

---

## 7. PIANO TEACHERS DIRECTORY PAGE

### Concept
After buying a piano, buyers are matched to verified Melbourne piano teachers. Teachers have their own login and profile page. This is a unique feature — no other Melbourne piano business does this.

### Teacher profile card
```
- Teacher photo (circular, gold border)
- Name in Cormorant Garamond
- Specialties (tags): Classical, Jazz, Contemporary, Kids, Adults
- Experience: "12 years teaching"
- Suburb: "Fitzroy"
- Rate: "From $80/hour"
- Availability indicator: green dot + "Available this week"
- [View profile] button
- [Book a trial lesson] button (links to Calendly or Appointo)
```

### AI matching logic (prompt for Claude Code)
```
After the piano purchase quiz, a second prompt:
"Tell us about the student:"
- Age: Child (under 12) / Teen / Adult
- Goal: Classical grades / Play for fun / Learn songs I love / Jazz & improv
- Availability: Weekdays / Evenings / Weekends
- Location: [Melbourne suburb input]

→ Returns top 3 matched teachers with match reason
```

### Teacher login portal (separate subdomain or /teacher-portal)
Each teacher gets:
- Profile editor (photo, bio, specialties, rates, availability)
- Booking calendar integration
- Student messages
- Referral tracking (how many students came from Signature Pianos)

---

## 8. POST-SALE CUSTOMER PORTAL

### URL: /my-piano or app.signaturepianos.com.au

### What it contains
```
Dashboard overview:
- Piano name + purchase date
- Next tuning due (with booking button)
- Care tips for current season
- Warranty status

Tuning & service:
- Book a tuning (Appointo integration)
- Service history log
- Recommended tuner contact

Piano care hub:
- Seasonal care guides (humidity, temperature Melbourne tips)
- Cleaning instructions
- Moving guidelines

Teacher connection:
- Linked teacher profile
- Lesson history
- "Find a new teacher" if needed

Documents:
- Purchase receipt
- Warranty certificate
- Delivery confirmation
```

---

## 9. TECH STACK

### Frontend
```
HTML5, CSS3, Vanilla JavaScript
GSAP 3 + ScrollTrigger (animations)
Web Audio API (interactive piano keys)
Google Fonts (Cormorant Garamond + DM Sans)
Tabler Icons (https://tabler.io/icons) — icon set
```

### No heavy dependencies
- No React/Vue needed for the marketing site
- No WebGL or Three.js (not necessary for the effect we want)
- Keep bundle size under 200kb uncompressed
- Target Lighthouse score: 90+ performance, 95+ accessibility

### For the app/portal later
```
Framework:    Next.js or Nuxt
CRM:          Twenty (open source, self-hosted)
Chatbot:      Chatwoot
Booking:      Appointo
Auth:         Clerk or Supabase Auth
Database:     Supabase (Postgres)
Hosting:      Vercel (frontend) + Railway or Render (backend)
Domain:       signaturepianos.com.au + app.signaturepianos.com.au
```

---

## 10. SEO & CONTENT STRATEGY

### Target keywords (Melbourne piano buyers)
```
Primary:
- "buy piano Melbourne"
- "piano shop Melbourne"
- "best piano for beginners Melbourne"
- "piano lessons Melbourne"
- "upright piano Melbourne"
- "digital piano Melbourne"

Secondary:
- "Yamaha piano Melbourne"
- "Kawai piano Melbourne"
- "grand piano Melbourne"
- "piano teacher Melbourne [suburb]"
- "second hand piano Melbourne"
- "piano tuning Melbourne"
```

### Meta for homepage
```html
<title>Signature Pianos Melbourne — Find Your Perfect Piano</title>
<meta name="description" content="Melbourne's most trusted piano destination. 
New, pre-loved, acoustic and digital pianos. AI-powered piano matching, 
verified teachers, and post-sale care — all in one place.">
<meta property="og:image" content="/og-image.jpg">
```

### Structured data (add to homepage)
```json
{
  "@context": "https://schema.org",
  "@type": "MusicStore",
  "name": "Signature Pianos",
  "address": { "@type": "PostalAddress", "addressLocality": "Melbourne", "addressRegion": "VIC" },
  "url": "https://signaturepianos.com.au",
  "telephone": "+61-X-XXXX-XXXX",
  "openingHours": "Mo-Sa 09:00-17:00"
}
```

---

## 11. COPY GUIDELINES

### Voice and tone
- **Confident, not arrogant.** We know pianos. We don't need to prove it.
- **Warm, not casual.** Professional but human. Never stiff.
- **Informative, not overwhelming.** Give buyers what they need, nothing more.
- **Never salesy.** No "LIMITED TIME OFFER" energy. Ever.

### Copy patterns to use
```
Headlines:     Short, evocative, often one line
               "Find the piano that moves you."
               "Melbourne's finest, matched to you."
               "Yours for life."

CTAs:          Action-first, specific
               "Find my piano" not "Click here"
               "Book a visit" not "Contact us"
               "Hear it play" not "Audio preview"

Body copy:     Short paragraphs, max 3 sentences
               No jargon unless explaining it
               Address the reader's anxiety directly
```

### Copy to avoid
```
❌ "We are proud to offer Melbourne's finest selection..."
❌ "World-class customer service"
❌ "One-stop shop"
❌ "Passionate about pianos" (show it, don't say it)
❌ Any copy that could appear on a competitor's site unchanged
```

---

## 12. BUILD ORDER FOR CLAUDE CODE

Work through this in order. Finish each phase before starting the next.

### Phase 1: Homepage (start here)
```
1. HTML structure + CSS variables + fonts loaded
2. Navigation (transparent → solid on scroll)
3. Hero section (headline + CTA + piano illustration)
4. Interactive piano keys with Web Audio
5. Piano matcher section (dropdowns + result popup)
6. Featured instruments grid (3 cards, 3D tilt hover)
7. Features grid (2x2)
8. Testimonials
9. Footer
10. GSAP scroll reveals on all sections
11. Custom cursor
12. Mobile responsiveness audit
13. Performance audit (target 90+ Lighthouse)
```

### Phase 2: Inner pages
```
1. Instruments catalogue page (filters + grid)
2. Individual piano product page
3. Piano teachers directory
4. About page
5. Contact / Book a visit
```

### Phase 3: App layer
```
1. Customer portal (post-sale hub)
2. Teacher login + profile editor
3. CRM integration (Twenty)
4. Chatbot (Chatwoot)
5. Booking system (Appointo)
```

---

## 13. SESSION PROMPTS FOR CLAUDE CODE

Copy and paste these at the start of each work session:

**Session 1 — Homepage structure:**
> "Read SIGNATURE_PIANOS.md. Build the Signature Pianos homepage as a single index.html file. Start with the CSS variables, fonts, nav, and hero section. Use GSAP from CDN for animations. Follow the colour palette and typography exactly as specified."

**Session 2 — Piano keys + matcher:**
> "Read SIGNATURE_PIANOS.md. We have the homepage structure. Now implement the interactive piano keys in the hero using Web Audio API (section 6.3) and the piano matcher with result popup (section 5.3 + 6.6)."

**Session 3 — Product cards + animations:**
> "Read SIGNATURE_PIANOS.md. Add the featured instruments grid with 3D tilt hover (section 6.5), the features grid, testimonials, and footer. Then add GSAP scroll reveals to every section (section 6.1) and the custom cursor (section 6.4)."

**Session 4 — Mobile + performance:**
> "Read SIGNATURE_PIANOS.md. Audit the homepage for mobile responsiveness — it must work perfectly on a 390px iPhone screen. Then run a Lighthouse audit and fix anything below 90 on performance."

**Session 5 — Teachers page:**
> "Read SIGNATURE_PIANOS.md. Build the piano teachers directory page (section 7). Use the same design system as the homepage. Include the teacher profile cards, filter bar, and AI matching quiz flow."

---

## 14. ASSETS NEEDED

### Before launch — photography brief
Organise a photographer session in the showroom. Key shots needed:
```
- 1 grand piano, full shot, dark studio lighting from left
- 5x key close-ups — different angles, warm lighting
- 2x hands on keys, natural/warm light
- 1x piano in a beautiful Melbourne living room setting
- 1x tuner working on piano interior (for post-sale section)
- 3–5x teacher headshots (for teacher directory)
- 1x showroom wide shot, evening lighting
```

### Placeholder images (use until real photography)
- Use `https://picsum.photos` with dark overlay for piano placeholders
- Or generate via Midjourney/DALL-E with prompt: "black grand piano, dark studio, dramatic side lighting, photorealistic, luxury product photography"

### Icons
Use Tabler Icons (free, consistent, clean):
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">
<!-- Usage: <i class="ti ti-music"></i> -->
```

---

## 15. TECH STACK & FILE STRUCTURE

```
Platform:       Flat HTML — no framework
File pattern:   services/delivery-warranty.html
                services/book-a-viewing.html
                services/tuning-servicing.html
                instruments/index.html
                teachers/index.html
                about.html
Internal links: Always use sibling .html references
Icons:          Tabler icons via @tabler/icons-webfont CDN only
                Never Lucide — Tabler throughout
Animations:     IntersectionObserver on sub-pages
                GSAP only on homepage
Database:       Supabase — single project for entire platform
Auth:           Supabase vanilla JS auth via CDN
Storage:        Supabase Storage for driver photos
Email:          Resend via Vercel serverless /api folder
Payments:       Stripe vanilla JS
Deployment:     Vercel — GitHub auto-deploy on push to main
```

---

## 16. SUPABASE SCHEMA

### Tables
```
customers           — every buyer, viewer, account holder
pianos              — full inventory, all types
orders              — every piano sale
deliveries          — delivery tracking + driver flow
warranties          — auto-generated post delivery
tuner_bookings      — auto-booked post warranty
viewing_bookings    — showroom visit requests
teachers            — all registered teachers
teacher_listings    — public teacher profile cards
teacher_bookings    — student lesson bookings
teacher_students    — full SaaS student roster
teacher_invoices    — teacher-generated student invoices
admin_users         — internal back office team
```

### Key conventions
```
Primary keys:     uuid, gen_random_uuid()
Timestamps:       created_at, updated_at (auto-update trigger)
Enums:            Created as Postgres CREATE TYPE
RLS:              Enabled on every table
Order numbers:    SP-YYYY-XXXXX format
Invoice numbers:  INV-YYYY-XXXXX format
Warranty numbers: WRT-YYYY-XXXXX format
Driver tokens:    Random 32 char URL-safe string
```

---

## 17. ENVIRONMENT VARIABLES

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
BUSINESS_EMAIL
RESEND_API_KEY
STRIPE_PUBLIC_KEY
STRIPE_SECRET_KEY
```

---

## 18. PAGES BUILT

```
✓ Homepage                    index.html
✓ Header nav                  shared component
✓ Instruments page            instruments/index.html
✓ Find a teacher              teachers/index.html
✓ Delivery & warranty         services/delivery-warranty.html
✓ Book a viewing              services/book-a-viewing.html
✓ Tuning & servicing          services/tuning-servicing.html
✓ About                       about.html
✓ Individual piano listing    piano.html (root) — Supabase + Stripe
✓ Checkout success            checkout-success.html
◯ Customer portal             portal/index.html
◯ Teacher dashboard           portal/teacher.html
✓ Driver pickup flow          delivery/pickup.html  (public, token)
✓ Driver delivery flow        delivery/dropoff.html (public, token)
✓ Driver acceptance flow      delivery/accept.html  (public, token)
✓ Driver pickup API           api/driver-pickup-confirm.js
✓ Driver delivery API         api/driver-delivery-confirm.js
✓ Driver acceptance API       api/driver-accept.js
✓ Delivery reminder cron      api/cron-delivery-reminders.js
                              (daily 22:00 UTC ≈ 8am AEST)
✓ Admin back office           admin/  — login, dashboard, enquiries,
                                       inventory (+ XLS import + service
                                       log badge + cost column),
                                       piano-detail (cost breakdown +
                                       service log CRUD + sales history),
                                       orders (+ PDF invoices + inline
                                       HTML preview + edit/void/overdue-
                                       reminder + discreet auto-margin),
                                       payment-plans (instalment plans +
                                       contract send + sign tracking +
                                       overdue reminders),
                                       customers, deliveries (+ partners
                                       tab + customer preferences),
                                       teachers, financials (P&L +
                                       revenue chart + XLSX export),
                                       settings
✓ Customer delivery prefs    delivery-preferences.html (public, token)
✓ Customer contract signing  payment-plan-sign.html (public, token)
```

---

## 19. SESSION START INSTRUCTIONS

Every Claude Code session must begin with:

> "Read SIGNATURE_PIANOS.md fully before writing any code. Match every existing pattern exactly — file naming, icon library, colour palette, animation approach, and Supabase table names."

---

## 20. KEY BUSINESS RULES

```
Warranty:           10 years on every piano
Tuner booking:      Auto-scheduled 3-4 weeks post delivery
Driver flow:        Photo required on pickup AND delivery
Delivery region:    Melbourne + regional Victoria
Warranty cert:      Auto-emailed after delivery confirmed
Piano condition:    Graded excellent / good / fair
Currency:           AUD throughout
GST:                10% — always show ex and inc GST on invoices
```

---

## 22. SUPABASE & BACKEND STATUS

### Wired pages
- services/book-a-viewing.html → viewing_bookings table ✓
- services/tuning-servicing.html → service_requests table ✓
- instruments/index.html → pianos table ✓

### Serverless functions
- api/send-email.js → handles all transactional emails via Resend ✓

### Shared files
- js/config.js → Supabase client init, imported on all DB pages ✓
- vercel.json → API routing + security headers ✓
- package.json → resend dependency ✓

### Pages still needing Supabase wiring
- instruments/piano.html (individual listing — not built yet)
- checkout.html (not built yet)
- portal/index.html (not built yet)
- portal/teacher.html (not built yet)
- delivery/[token].html (not built yet)
- admin/index.html (not built yet)

### Environment variables needed in Vercel dashboard
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
RESEND_API_KEY, BUSINESS_EMAIL,
STRIPE_PUBLIC_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
SITE_URL (e.g. https://signaturepianos.com.au),
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE (optional — tuner SMS)

### Supabase schema notes
```
Piano pricing:    sale_price only — single listed retail price
                  Discounts applied manually in admin portal at point of sale
Piano condition:  A+ = near mint or fully refurbished
                  B+ = very good, age-consistent wear
Inventory:        16 Yamaha acoustic uprights loaded May 2026
```

### Tuner flow
```
Tuners table:     stores partner tuner details (name, email, phone,
                  suburb, active flag, internal notes). Seeded via
                  supabase/tuners_table.sql with three placeholders.

Assign flow:      Eric opens a delivery in admin/deliveries.html, picks
                  a tuner from the dropdown + proposes a date/time,
                  clicks "Assign tuner & send".
                  → tuner_bookings row inserted or updated
                  → /api/tuner-booking mints confirmation + completion
                    tokens, emails the tuner (branded Signature template),
                    and fires a Twilio SMS if env vars are set.
                  → Internal notification email to Eric.

Confirm:          Tuner clicks the confirmation link in the email.
                  → /api/tuner-confirm flips status to 'confirmed',
                    emails the customer their booking summary,
                    pings Eric, and redirects the tuner to
                    /tuner/confirmed.html.

Complete:         Tuner clicks the completion link after the visit.
                  → /api/tuner-complete (GET) renders a mobile form
                    for optional completion notes.
                  → POST flips status to 'completed', emails the
                    customer (with a CTA to book another tuning),
                    and notifies Eric.

Visibility:       admin/deliveries.html shows a tuner column with the
                  current status on every delivery row. The Tuners tab
                  is a simple CRUD view of the tuners table.
```

### Piano cost tracking & service log
```
Schema:        supabase/inventory_updates.sql adds:
                 pianos.base_cost / cost_price / purchase_date / purchase_notes
                 piano_service_log table (date / type / description / cost /
                 performed_by / notes)
               A Postgres trigger recalcs pianos.cost_price as
                 base_cost + SUM(service_log.cost)
               on every insert/update/delete in piano_service_log.

XLS import:    admin/inventory.html → "Import XLS" button opens a panel
               with a downloadable template, drop zone, parsed preview
               (errors highlighted in red), and a "confirm" insert.
               SheetJS via CDN — entirely client-side. 200 row cap.
               Required columns: brand, model. Optional: year / serial /
               condition / price / status / description_short /
               description / weight_kg / featured / base_cost /
               purchase_date / purchase_notes.

Detail view:   admin/piano-detail.html?id=X shows 4 metric cards
               (cost / sale / margin / profit), specs table, cost
               breakdown, full service-log CRUD via slide panel,
               and sales history for the piano.

Inventory row: each row now shows a service log count badge (◉ N) next
               to the piano name + a detail-view button in the actions
               column.
```

### Stripe webhook + delivery flow
```
Webhook:       api/stripe-webhook.js receives checkout.session.completed,
               verifies signature with STRIPE_WEBHOOK_SECRET (raw body —
               bodyParser is disabled), then:
                 1. Upserts customers by email
                 2. Inserts orders (idempotent on stripe_session_id)
                 3. Marks piano sold (full) or reserved (deposit)
                 4. Creates a deliveries row with auto_created=true and
                    a fresh preference_token
                 5. Emails the customer with their preferences link
                 6. Emails Eric the internal sale notification

Preferences:   delivery-preferences.html (public, dark/gold theme,
               token-based — no auth). Customer picks 3 preferred
               windows + confirms address + adds special instructions.
               Submit writes back to deliveries; anon RLS policy is
               scoped by preference_token and a guard trigger locks
               anon writes to the preference columns only.

Partners:      delivery_partners table (name / contact / phone / email /
               service_area / notes / active). Managed from a new
               "Partners" tab in admin/deliveries.html. Each delivery
               can be assigned a partner from the detail panel.
               Two placeholder partners are seeded by the SQL migration.

Emails:        api/send-email.js gained four types this round:
                 overdue_reminder         — admin → customer
                 purchase_confirmation    — webhook → customer (w/ pref link)
                 internal_sale_notification — webhook → Eric
                 delivery_preferences_submitted — public form → Eric
```

### Invoice management flow
```
Settings table:   company_settings holds business name, ABN, address,
                  email/website, bank details (name/BSB/account/account
                  name), and the invoice_notes footer. Singleton row,
                  edited via admin/settings.html. Both the pdfmake PDF
                  and the inline HTML preview pull from this table —
                  one source of truth for branding.

Orders columns:   voided / voided_at / voided_reason for soft delete,
                  invoice_number (auto-sequenced via generate_token()),
                  line_items JSONB (snapshot of the rows on the invoice).

View invoice:     Eye icon on each row → full-screen modal with an HTML
                  invoice that mirrors the PDF layout, plus a Download
                  PDF button inside the modal.

Edit invoice:     Pencil icon → slide-in panel with status / payment
                  method + reference / total / discount / notes. GST is
                  recalculated as total ÷ 11 on save. Invoice number is
                  preserved so re-issued PDFs stay traceable.

Void invoice:     Trash icon → prompt for optional reason → orders row
                  is soft-deleted (voided=true) and the piano flips
                  back to stock_status='available' so it returns to
                  the public catalogue. The Voided invoices filter pill
                  shows the audit trail.

Overdue reminder: Bell icon (only shown on unpaid, non-Stripe orders)
                  → POSTs { type: 'overdue_reminder' } to /api/send-email,
                  which fires the branded customer reminder template.
```

### Tuner-flow env vars (Vercel dashboard)
```
TWILIO_ACCOUNT_SID    — twilio.com → Console → Account SID
TWILIO_AUTH_TOKEN     — twilio.com → Console → Auth Token
TWILIO_PHONE          — your Twilio phone (e.g. +61400000000)
SITE_URL              — https://signaturepianos.com.au
```
SMS is optional — if Twilio env vars aren't set, the email still goes
out and the SMS step is skipped (logged as a warning).

### POS / invoice flow (admin/orders.html)
```
New order panel:    9 sections (A–I) — Customer details (incl. full
                    address + optional business name & ABN), Piano +
                    cost price, Margin calculator (30% target — green
                    if hit, amber otherwise, never shown on invoice),
                    Sale price (live ex-GST hint), Additional line
                    items (Delivery / Piano tuning / Piano stool with
                    editable defaults + spare row + Add line item),
                    Discount (fixed $ or %), Live totals, Payment
                    details, Create & generate invoice button.
Customer schema:    address_line1 / address_line2 / suburb / state /
                    postcode columns plus is_business / business_name /
                    abn. Added by supabase/update_orders.sql.
Orders schema:      line_items jsonb (per-line breakdown stored with
                    the order), subtotal_ex_gst, gst_amount. Legacy
                    `subtotal` column kept as inc-GST pre-discount.
Invoice PDF:        Full Australian tax invoice via pdfmake —
                    dark/gold header strip, business name + ABN block
                    when applicable, full address, line items table
                    with Ex/Inc GST columns, discount as a negative
                    line, totals (ex GST / GST 10% / TOTAL inc GST
                    in gold), payment method + reference, TODO
                    bank-detail placeholder. Filename:
                    Invoice-INV-YYYY-XXXXX-<LastName>.pdf.
Run order:          1. supabase/update_orders.sql in the SQL editor
                    2. Refresh admin/orders.html
                    3. Test a full sale — PDF should download
                       automatically on Create order.
```

### Financial reporting (admin/financials.html)
```
Date range:         Quick range pills (This month / Last month / This
                    quarter / This financial year / All time) + custom
                    From/To inputs. AU financial year = 1 July → 30 June.
                    Defaults to the current calendar month on load.

Metric cards:       Total revenue (inc GST, gold), Gross profit (green
                    if ≥ 0, red otherwise), Gross margin % (green if
                    ≥ 30%, amber otherwise), GST collected (blue).
                    Secondary row: Revenue ex GST + Cost of goods sold.

Revenue chart:      Chart.js bar chart — revenue + gross profit grouped
                    by YYYY-MM. Destroys and recreates on every range
                    change so we never leak a duplicate canvas. Loaded
                    from Chart.js 4.4.0 CDN.

P&L summary:        Stacked table — revenue (inc GST) → less GST → ex
                    GST subtotal → COGS → gross profit + margin →
                    sale count + average sale price.

Transactions:       Per-sale row — date / invoice / customer / piano /
                    total / cost / profit / margin / status. Margin pill
                    is green at ≥ 30%, amber below. Empty state when
                    no orders fall in the period.

XLSX export:        SheetJS via CDN (already on inventory.html).
                    4 sheets:
                      Summary           — P&L overview
                      Transactions      — every sale + GST breakdown
                      GST Report        — totals row for BAS lodgement
                      Piano Performance — per-piano profit + margin
                    Filename: Signature-Pianos-Financials-
                              YYYYMMDD-YYYYMMDD.xlsx
                    Button is disabled while the range has no orders;
                    toast on success or failure.

Data source:        orders (where voided = false) joined to
                    customer:customer_id(first_name,last_name,email)
                    and piano:piano_id(cost_price,model,year,
                    serial_number,brand,condition). No new tables.
```

### Invoice & order emails
```
Send invoice:       Mail-forward icon on every non-voided order row
                    in admin/orders.html. Confirms before sending,
                    POSTs `send_invoice` to /api/send-email, which
                    fires the branded HTML invoice to the customer
                    and a "sent" notification to Eric. Toast on
                    success / failure.

POS acoustic:       admin/orders.html — on Create order, after the
                    order insert succeeds, an auto-delivery row is
                    written (status=scheduled, auto_created=true,
                    fresh preference_token), and the customer gets
                    BOTH a warm confirmation email (with the
                    preference link) AND a separate invoice email.

POS digital:        Same Create order path, but no delivery row is
                    created. Customer gets a collection-confirmation
                    email and a separate invoice email. Eric is
                    notified that the customer is collecting from
                    the showroom.

Stripe webhook:     api/stripe-webhook.js now branches on
                    piano.type. Acoustic full purchases keep the
                    existing delivery + purchase_confirmation flow
                    and ALSO POST send_invoice. Digital full
                    purchases skip the delivery insert and POST
                    digital_order_confirmation (which bundles the
                    invoice). Deposits keep the existing flow.
                    Internal sale notification carries an
                    `is_acoustic` flag so the delivery summary line
                    is accurate.

Shared templates:   api/send-email.js defines four shared template
                    functions, each used by multiple dispatch types:
                      generateInvoiceEmailHTML       — invoice card
                      posOrderConfirmationEmail      — warm "thanks"
                                                       + preference CTA
                      digitalOrderConfirmationEmail  — collection CTA
                      deliveryConfirmedEmail         — date locked
                    Never duplicated — every email type pulls these
                    from a single place.
```

### Delivery type rule
```
acoustic_upright    → delivery record created, preference link sent
acoustic_grand      → delivery record created, preference link sent
digital             → no delivery record, collection email sent

Applied identically in admin/orders.html (POS create) and
api/stripe-webhook.js (online checkout).
```

### Delivery confirmation
```
Trigger:            admin/deliveries.html — Confirm date & notify
                    customer button. Gold filled, full width,
                    rendered inside the delivery detail panel
                    only when scheduled_date is set on the row.
                    Always preceded by a window.confirm dialog so
                    a stray click can't email the customer.

What it sends:      delivery_confirmed POST to /api/send-email.
                    Customer email: branded card with the date,
                    time window, optional notes, and a "what
                    happens next" box. Date format DD/MM/YYYY.
                    Eric email: internal copy with the same date
                    and a pointer to who was notified.

Side effect:        Forces delivery.status back to 'scheduled' so
                    the row can't be left in pickup_pending after
                    a partial edit. Reloads the deliveries table
                    on success so the row reflects the change.
```

### Payment plans (admin/payment-plans.html + payment-plan-sign.html)
```
Schema:            supabase/payment_plans.sql adds:
                     payment_plans       — one row per plan
                     payment_instalments — full schedule
                     storage bucket 'contracts' (private)
                     generate_plan_number() — PP-YYYY-XXXXX
                   Trigger uses the existing set_updated_at()
                   helper (spec called it update_updated_at_column;
                   we standardise on the project-wide name).

Numbering:         PP-YYYY-XXXXX (5-digit zero-padded sequence
                   per calendar year). Signature_token is the
                   project's existing generate_token() default.

Admin page:        4 metric cards (active / pending signature /
                   completed / overdue payments), plans table
                   with progress bar + contract status pill, a
                   detail slide-in panel and a New plan slide-in.

New plan flow:     A. Optional order link (auto-fills customer
                      + piano + total when matched on invoice #
                      or order #).
                   B. Customer search OR inline create (upsert
                      by email so duplicates merge).
                   C. Piano dropdown (every piano, with status).
                   D. Plan details — total / deposit /
                      instalment count (3/6/9/12/18/24) /
                      frequency (weekly/fortnightly/monthly) /
                      start date / deposit-paid checkbox / notes.
                   E. Live schedule preview that recalculates
                      on every input/change event — deposit,
                      remaining, per-instalment rows + total.
                   Create button RPC-calls generate_plan_number,
                   inserts the plan, then inserts every
                   instalment row with payment_plan_id stamped.

Detail panel:      A — Plan summary grid (customer / piano /
                       total / deposit / instalments / status)
                   B — Gold progress bar — X of Y paid + %
                   C — Instalment schedule with Paid / Overdue /
                       Due soon / Upcoming badges. Mark-as-paid
                       prompts for method + reference; auto-flips
                       plan to completed when all instalments paid.
                   D — Contract block: status pill (signed /
                       sent / not sent), Send/Resend, Download
                       signed (signed URL via Supabase Storage),
                       Copy sign link.

Public sign page:  payment-plan-sign.html?token=... at root.
                   Dark Cormorant + DM Sans aesthetic with a
                   formal white "document" card inside. Includes
                   piano details, payment terms, full schedule,
                   six-point T&Cs, signature canvas (mouse +
                   touch, HiDPI-correct), typed full name, and
                   an "I agree" checkbox. Already-signed contracts
                   show a success state instead of the form.

Signature API:     api/sign-contract.js (Vercel serverless).
                   Verifies plan_id + signature_token together,
                   refuses to overwrite, decodes the data-URL
                   PNG and uploads to the `contracts` bucket as
                   {plan_number}-signature-{ts}.png, sets
                   contract_signed / contract_signed_at /
                   contract_url / status='active', then POSTs
                   payment_plan_signed to /api/send-email for
                   the customer confirmation + Eric notification.

Storage:           contracts bucket — private. Admin read via
                   is_admin() policy; service role manages
                   uploads/deletes. Admin downloads use a 60s
                   signed URL from createSignedUrl().

Email types
(api/send-email.js):
                   payment_plan_contract  — sent on Send/Resend.
                                            Branded HTML card with
                                            plan summary, schedule
                                            and a Sign CTA pointing
                                            at the public token URL.
                   payment_plan_signed    — fired by sign-contract.js
                                            after a successful sign.
                                            Customer confirmation +
                                            Eric notification.
                   instalment_reminder    — overdue reminder on the
                                            Send-reminder button. Lists
                                            every overdue instalment +
                                            BSB / account / reference.

Run order:         1. supabase/payment_plans.sql in SQL editor
                   2. Confirm storage bucket 'contracts' exists
                      (private). SQL creates it idempotently.
                   3. Refresh admin/payment-plans.html
                   4. Smoke test: create plan → send contract →
                      open the email's sign link → sign → check
                      Storage upload + plan row flips to active.
```

### Email previews + tuner / driver notification overhaul
```
Delivery prefs:    The internal email fired when a customer submits
                   their 3 windows is now a full branded HTML card:
                   customer name + email + phone, order #,
                   invoice #, piano (with serial), confirmed
                   address, all three preferences, special
                   instructions, and a one-click CTA to the admin
                   deliveries page. delivery-preferences.html now
                   sends the richer payload via /api/send-email.

Tuner booking:     api/tuner-booking.js now sends the tuner an
                   email containing the customer's email, phone
                   AND full address (line1 + suburb + state +
                   postcode), plus Email customer / Call customer
                   buttons that tap straight into the dialer or
                   mail client. The Twilio SMS mirrors the same
                   structured layout so the tuner can act from
                   SMS alone if needed.

Test email button: admin/deliveries.html topbar — small "Send test
                   emails" link. Fires four emails to
                   kuangeric1234@gmail.com with realistic mock
                   data and a "TEST EMAIL" banner across the top
                   of each so they can't be mistaken for live:
                     1. delivery_preferences_submitted (via the
                        regular dispatcher)
                     2. /api/send-tuner-test (tuner booking)
                     3. /api/send-driver-test type=pickup
                     4. /api/send-driver-test type=delivery
                   Toast reports a per-email success/fail count.

Driver photo
links (live):      Send pickup photo link / Send delivery photo
                   link buttons inside the delivery detail panel,
                   only useful once a delivery partner with an
                   email is assigned. Both POST to /api/send-email
                   (types driver_pickup_link / driver_delivery_link)
                   which fire a branded card with full address,
                   piano details, the assigned date/time, an
                   "Important — don't move until photos uploaded"
                   warning, and an Upload photos CTA pointing at
                   /delivery/{token}. Note: that destination page
                   isn't built yet — the link 404s until a follow-
                   up session adds /delivery/[token].html +
                   api/driver-confirm.js for the upload flow.

Shared template:   buildDriverLiveEmail() in api/send-email.js is
                   the live counterpart to buildDriverTestEmail()
                   in api/send-driver-test.js. Same layout, no
                   test banner, with scheduled date/time rows
                   added when present.
```

### Driver photo flow (pickup + delivery)
```
Public routes:    /delivery/{pickup_link_token}        → delivery/pickup.html
                  /delivery/drop/{delivery_link_token} → delivery/dropoff.html
                  Both wired in vercel.json as rewrites that pass the
                  path segment through as ?token=... so the existing
                  page code reads it the same way as
                  delivery-preferences.html and payment-plan-sign.html.

Pages:            Mobile-first dark/gold aesthetic. Inspect → photograph →
                  upload. Minimum 3 photos enforced client-side (submit
                  button is disabled until met), hard cap 10. Photo input
                  uses accept="image/*" capture="environment" so phones
                  open the back camera straight away. Photo grid preview
                  with × remove buttons. Free-text notes field. Both
                  pages handle already-confirmed and invalid-token states
                  gracefully.

Upload path:      Client uploads directly to Supabase Storage with the
                  anon key via the new "Anon upload delivery photos"
                  policy. Files land at:
                    {delivery_id}/pickup/{ts}-{n}.jpg
                    {delivery_id}/delivery/{ts}-{n}.jpg
                  Bucket: 'delivery-photos'. Visibility: PUBLIC (override
                  of the spec's false — the admin renders photos via
                  plain <img src=publicUrl>, which requires public reads).
                  Storage path is UUID-scoped so URLs aren't easily
                  guessable.

Confirm APIs:     api/driver-pickup-confirm.js and
                  api/driver-delivery-confirm.js. Both verify the token
                  against deliveries via service role, do the row
                  update under the service role (bypassing the
                  deliveries_anon_guard trigger that otherwise blocks
                  status changes from anon), and fire the customer +
                  Eric emails.

On pickup:        deliveries.status='picked_up'
                  + pickup_photos / pickup_notes / pickup_confirmed_at
                  + customer email "your piano is on its way"
                  + Eric notification with photo count + driver notes

On delivery:      deliveries.status='delivered'
                  + delivery_photos / delivery_notes / delivered_at
                  + warranties row inserted (WRT-YYYY-XXXXX, 10 years)
                  + tuner_bookings row inserted (auto_booked=true,
                    proposed_date = today + 25 days, with
                    confirmation + completion tokens minted)
                  + 2 customer emails: arrival + warranty certificate
                  + Eric notification w/ "Action: assign tuner" prompt
                  + warranty.certificate_sent flipped after cert email

Admin display:    admin/deliveries.html detail panel now renders both
                  pickup and delivery photo grids via renderDeliveryPhotos().
                  Sections only show when photos exist. Each photo is an
                  <a target="_blank"> so admin can pop the full size.
                  Pickup / delivery notes shown italicised below their
                  grid when present. The Copy pickup link / Copy delivery
                  link buttons in the same panel now hardcode the public
                  host so URLs work from the admin.signaturepianos.com.au
                  subdomain too.

Run order:        1. supabase/driver_flow.sql in SQL editor (adds
                     pickup_notes / delivery_notes columns + bucket +
                     RLS — idempotent).
                  2. Confirm storage bucket 'delivery-photos' is PUBLIC
                     in the Supabase dashboard. SQL sets this; if it
                     was created earlier as private the SQL flips it.
                  3. Smoke test: assign a delivery partner with an
                     email → Send pickup photo link → click in email →
                     upload 3 photos → check Storage + photos appear
                     in admin → repeat for delivery → verify the
                     warranty + tuner_booking rows + 2 customer emails.
```

### Driver acceptance + reminders (Session 9)
```
Showroom address: 63 Blackburn Road, Mount Waverley VIC 3149.
                  Burned into the driver assignment email + accept
                  page + reminder emails as the pickup location.

Schema:           supabase/driver_flow_updates.sql adds:
                    driver_accepted / _at / _preference
                    acceptance_token (unique, indexed)
                    reminder_3day_sent / _at
                    reminder_day_of_sent / _at
                  Existing anon SELECT on deliveries already covers
                  the accept page (every row has pickup/delivery
                  tokens so the OR clause matches).

End-to-end flow:
  1. Admin assigns a delivery partner + clicks Assign & notify driver.
  2. Driver email lands with the customer's three preferred windows.
     Email contains piano, customer + delivery address, warehouse
     pickup address (63 Blackburn Rd), and an Accept CTA pointing at
     /delivery/accept/{acceptance_token}.
  3. Driver opens the accept page on their phone, picks one of the
     three windows, optionally leaves a note, hits Confirm.
  4. api/driver-accept.js writes driver_accepted + scheduled_date +
     scheduled_time_window, sets status='scheduled', and fires:
       - Customer email: "Your delivery is confirmed for {date}"
       - Eric email: "Driver accepted — assign-tuner prompt"
  5. Daily cron (vercel.json crons + api/cron-delivery-reminders.js
     at 22:00 UTC = 08:00 AEST) checks every accepted+scheduled row
     and sends:
       - 3-day reminder when scheduled_date = today + 3
       - Day-of reminder when scheduled_date = today AND status is
         still 'scheduled' (i.e. pickup hasn't happened yet)
     Both flags are idempotent (boolean + _at timestamp) so retries
     never double-send.
  6. Driver opens the pickup link from the email → uploads 3+ photos.
     api/driver-pickup-confirm.js now ALSO fires a "next step:
     delivery photos required" email to the same driver immediately
     after the pickup is confirmed, so they have the dropoff link
     queued before they arrive at the customer.
  7. Driver uploads dropoff photos → existing
     api/driver-delivery-confirm.js inserts warranty + tuner booking
     and sends the customer arrival + certificate emails.

Admin UI:         Delivery detail panel — Assign & notify driver is
                  now the primary gold button. Pickup / delivery
                  photo link buttons are gated behind
                  driver_accepted=true (a "Photo links available
                  after driver accepts" hint shows otherwise). A
                  small green "✓ Driver accepted · {date}" line
                  appears between assign + photo buttons once the
                  driver has accepted.

Vercel cron:      vercel.json gains:
                    "crons": [{ "path": "/api/cron-delivery-reminders",
                                "schedule": "0 22 * * *" }]
                  Plus a new rewrite:
                    "/delivery/accept/:token" →
                    "/delivery/accept.html?token=:token"
                  Cron auth: Vercel auto-attaches
                  Authorization: Bearer ${CRON_SECRET}; the handler
                  rejects anything else with 401 so the endpoint
                  is unhittable from the public internet.

Env vars:         CRON_SECRET — any unguessable random string.
                  Add to Vercel dashboard under Project Settings →
                  Environment Variables. The cron handler reads it
                  from process.env. If unset, every cron call returns
                  401 and no reminders go out.

Pref string fmt:  Customer preferences are stored as jsonb
                  { date: 'YYYY-MM-DD', time: 'Morning…' }.
                  admin/deliveries.html flattens them to
                  "YYYY-MM-DD <time>" before POSTing to send-email so
                  the assignment email + later split-on-space date
                  parsing in api/driver-accept.js work as designed.
                  The accept page also reads the jsonb directly and
                  formats client-side for display.

Run order:        1. supabase/driver_flow_updates.sql in SQL editor
                  2. Add CRON_SECRET to Vercel env vars + redeploy
                     so the cron registration picks it up
                  3. Smoke test:
                     a. Customer submits delivery preferences
                     b. Admin opens delivery, picks a partner, clicks
                        Assign & notify driver
                     c. Open driver email → click Accept → pick a
                        window → confirm
                     d. Check Supabase: driver_accepted=true,
                        scheduled_date / window set, status='scheduled'
                     e. Check customer inbox for confirmation email
                     f. Manually fire a cron pass via curl with the
                        CRON_SECRET to verify the reminder logic
                        (or wait for 08:00 AEST)
```

### Tuner acceptance + propose-new-date flow (Session 10)
```
Mirrors the driver acceptance flow. The tuner-booking email now
carries two buttons (Accept / Propose) instead of the single
Confirm link, plus an Add-to-calendar block for the proposed date.

Schema:           supabase/tuner_response.sql adds:
                    acceptance_token (unique, indexed)
                    tuner_accepted / _at
                    tuner_response   — 'accepted' | 'proposed_new'
                    tuner_proposed_date / _time
                  Plus an anon SELECT-by-token policy so
                  tuner/respond.html can read the booking before
                  submitting.

Email changes:    api/tuner-booking.js now mints + persists an
                  acceptance_token on every send and passes
                  acceptUrl + proposeUrl into tunerBookingEmail.
                  The old Confirm / Email / Call CTA block is
                  replaced with:
                    ✓ Accept — {date · time}        (gold filled)
                    ↩ Propose a different date     (outline)
                  followed by a fallback paragraph with the
                  customer's tel: link. The legacy
                  /api/tuner-confirm GET endpoint still exists and
                  the confirmation_token is still minted for
                  backwards compatibility, but no longer surfaced.

Calendar block:   Below the response buttons. Three links: Google
                  Calendar, Outlook, and a data: URL .ics download.
                  generated by generateCalendarLinks() in
                  api/tuner-booking.js. Time-window phrases like
                  "Morning (9am–12pm)" map to 09:00 start; defaults
                  to a 2-hour event in the recipient's local zone
                  (Melbourne for our tuners).

                  Calendar helper location: co-located in
                  api/tuner-booking.js for now since that's the only
                  consumer. TODO: extract to lib/calendar.js when a
                  second email needs it (driver assignment is the
                  likely next candidate).

Public response:  tuner/respond.html?token=... — dark/gold mobile
                  page with two views toggled by ?action=propose.
                  Accept view: confirmed-date summary + Confirm /
                  Propose buttons. Propose view: date picker (min =
                  tomorrow), time-window select, optional notes,
                  Submit. Both render an already-responded state
                  when the booking has been touched.

API:              api/tuner-respond.js — verifies acceptance_token
                  + booking_id, branches on response:
                  - 'accepted'     → tuner_accepted=true,
                                     status='confirmed', customer
                                     confirmation email + Eric note.
                  - 'proposed_new' → tuner_proposed_date / _time set,
                                     status stays 'pending', Eric
                                     gets an action-required email
                                     listing the original and tuner-
                                     proposed dates so he can ring
                                     the customer and update the
                                     booking from admin.
                  Notes appended to completion_notes rather than
                  overwriting.

Vercel route:     "/tuner/respond/:token"
                  → "/tuner/respond.html?token=:token"

Run order:        1. supabase/tuner_response.sql in SQL editor
                  2. Smoke test:
                     a. Trigger an existing tuner booking
                        (admin/deliveries.html → assign tuner)
                     b. Open the tuner email → check that Accept,
                        Propose, and the calendar block render
                     c. Click Accept → tuner_accepted=true,
                        status='confirmed', customer email lands
                     d. For a second booking, click Propose →
                        submit new date → check Eric's inbox for
                        the action-required note + Supabase row
                        for tuner_proposed_date / _time
```

### Tuner booking flow — REBUILT (Session 12)
```
Replaces the Session-10 accept/propose flow with a simpler workflow:
tuner contacts the customer directly, they agree a date offline,
tuner logs it via a single mobile-friendly link.

Schema:           supabase/tuner_flow_rebuild.sql adds:
                    trigger_date                  date
                    contact_sent / _at
                    log_date_token (unique)
                    date_logged / _at
                    confirmed_date / confirmed_time
                    day_before_reminder_sent / _at
                    completed / _at
                    completion_token (no-op if already exists)
                  Plus 'contact_sent' added to
                  tuner_booking_status enum, and an anon SELECT
                  policy scoped to log_date_token so
                  /tuner/log-date.html can read the booking.

End-to-end flow:
  Day 0   Delivery confirmed → api/driver-delivery-confirm.js
           creates a tuner_bookings row with:
             trigger_date = today + 25 days
             log_date_token + completion_token minted
             contact_sent=false, date_logged=false,
             completed=false, status='pending'
           No emails fire yet. Admin can assign a tuner from
           the existing delivery detail panel any time before
           the trigger date.

  Day 25  Daily cron at 22:00 UTC (~08:00 AEST):
           api/cron-delivery-reminders.js — scans for
           tuner_bookings where trigger_date = today AND
           contact_sent = false AND completed = false.
             a. If no tuner assigned → ping Eric with an
                action-required email; row left alone so
                tomorrow's cron retries.
             b. Otherwise:
                - customer heads-up email: "your piano is
                  ready for its first tuning"
                - tuner action email: full customer details +
                  log-date link
                - row flipped to contact_sent=true,
                  status='contact_sent'

  Day 25+ Tuner contacts customer offline, agrees date.
           Opens /tuner/log-date/{log_date_token} on phone:
             - date picker (min = tomorrow)
             - time-window select
             - optional notes
           Submits → api/tuner-log-date.js writes
           confirmed_date / _time, date_logged=true,
           status='confirmed'.

  After
  logging Three emails fire:
             a. Tuner: confirmation w/ calendar links
                (Google, Outlook, Apple .ics) + complete CTA
             b. Customer: "your tuning is confirmed for {date}"
             c. Eric: internal note

  Day-1   Same daily cron — scans confirmed_date = tomorrow
           AND day_before_reminder_sent = false:
             - Tuner reminder: date, address, complete link
             - Customer reminder: date, time
           day_before_reminder_sent flipped true.

  Day 0+  Tuner clicks /api/tuner-complete?token={completion_token}
           → marks completed=true (existing endpoint, unchanged).

Manual override:  Admin "Send contact email now" button inside
                  the delivery detail panel's tuner section. Only
                  shown when contact_sent=false AND a tuner is
                  assigned. Fires the same two-email pair as the
                  cron via api/tuner-send-contact.js. Useful when
                  the trigger_date is days away but Eric wants to
                  push the contact email immediately.

Admin status:     renderTunerBookingStatus() in admin/deliveries.html
                  shows:
                    - Pending — contact not yet sent
                    - Contact sent — awaiting tuner to log date
                    - Confirmed
                    - Completed
                  plus the confirmed date + contact_sent_at +
                  completed_at timestamps when present.

Shared modules:   lib/calendar.js — generateCalendarLinks(), now
                                    shared between
                                    api/tuner-booking.js (legacy)
                                    and api/tuner-log-date.js.
                  lib/tuner-emails.js — customerTuningReadyEmail
                                    + tunerContactEmail, shared
                                    between cron + manual send.

Deprecated:       The Session-10 accept/propose flow stays in
                  place as dead code (tuner/respond.html,
                  api/tuner-respond.js) but the
                  /tuner/respond/:token rewrite has been removed
                  from vercel.json. Safe to delete the files
                  after a week of the new flow running cleanly.

Run order:        1. supabase/tuner_flow_rebuild.sql in SQL editor
                  2. Confirm the enum value was added — open
                     Supabase Studio → Database → Types →
                     tuner_booking_status — expect 'contact_sent'
                     in the list. (The DO block swallows the
                     "already exists" error so re-runs are safe.)
                  3. Smoke test:
                     a. Make a delivery → driver-delivery-confirm
                        should create a tuner_booking row with
                        trigger_date = +25 days, log_date_token set
                     b. Assign a tuner from admin/deliveries.html
                     c. Click "Send contact email now" → check
                        both inboxes for customer heads-up + tuner
                        action email; row.status should flip to
                        'contact_sent'
                     d. Open the tuner email's log-date link on a
                        phone → submit date + time → check
                        Supabase: confirmed_date / _time / status
                        = 'confirmed', date_logged = true
                     e. Verify the customer + tuner + Eric
                        confirmation emails landed
                     f. To dry-run the reminder cron:
                          curl https://signaturepianos.com.au/api/cron-delivery-reminders \
                            -H "Authorization: Bearer $CRON_SECRET"
                        (any rows with confirmed_date = tomorrow
                         will get the day-before reminder)
```

---

*Last updated: May 2025*
*Brief version: 1.0*
*Owner: Signature Pianos Melbourne*

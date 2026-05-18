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
◯ Driver flow                 delivery/[token].html
✓ Admin back office           admin/  — login, dashboard, enquiries,
                                       inventory, orders (+ PDF invoices),
                                       customers, deliveries, teachers
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
RESEND_API_KEY, BUSINESS_EMAIL

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

---

*Last updated: May 2025*
*Brief version: 1.0*
*Owner: Signature Pianos Melbourne*

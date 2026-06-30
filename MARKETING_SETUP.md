# Marketing & Blog engine — setup

AI-powered website auditing + SEO/AI-search blog writing, built into the admin
dashboard, with a public blog on the site.

## What you get

- **Admin → Marketing** tab with three tools:
  - **Blog** — write an SEO + AI-search optimised draft from any topic, edit it,
    publish/unpublish, delete. Posts appear at `/blog`.
  - **Website audit** — paste a URL, get scored SEO + AI-search (AEO) findings with fixes.
  - **Auto-writer** — info + a "Generate one now" test button.
- **Auto-loop**: a cron job (Mon/Wed/Fri) researches new Yamaha / digital piano
  releases via web search and writes a full post **as a draft** for you to review.
  Nothing auto-publishes.
- **Public blog**: `/blog` (index) and `/blog/<slug>` (articles), server-rendered
  with full SEO meta + JSON-LD (BlogPosting + FAQPage), plus `/sitemap.xml` and
  `/llms.txt` for AI crawlers. A "Blog" link is in the homepage nav.

## 1. Run the database migration

In the Supabase SQL editor (project `ernwymzmwhscsjgrnouv`), run:

- `supabase/blog.sql`  — creates `blog_posts`, `content_audits`, `blog_topics` + RLS.

(Run `supabase/missing_tables.sql` first if you haven't — `blog.sql` needs its
`is_admin()` / `set_updated_at()` helpers.)

## 2. Add environment variables in Vercel

Project → Settings → Environment Variables:

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Create at https://console.anthropic.com → API Keys. Value starts with `sk-ant-`. This powers everything. |
| `AI_MODEL` | No | Defaults to `claude-sonnet-4-6` (cheap, fast — ~$3/$15 per 1M tokens). Set to `claude-opus-4-8` for higher quality at higher cost. |
| `GSC_SERVICE_ACCOUNT_EMAIL` | No | Connects **real Google search data**. See "Connect Google Search Console" below. |
| `GSC_PRIVATE_KEY` | No | The service-account private key (PEM block). Paste the whole thing. |
| `GSC_SITE_URL` | No | The property as it appears in Search Console. Defaults to `SITE_URL`. |

These should already exist (used elsewhere) — confirm they're set:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `CRON_SECRET`.

## Connect Google Search Console (real search data) — optional but recommended

Without this, the writer *guesses* trending topics via web search. With it, the
writer sees the **actual queries people use to find signaturepianos.com.au** and
prioritises the "opportunity" terms (real demand where you rank poorly). You can
also view them in **Admin → Marketing → Auto-writer → Load top searches**.

One-time setup:

1. **Verify the site in Search Console** (https://search.google.com/search-console)
   if you haven't — domain property `signaturepianos.com.au` is ideal.
2. **Create a service account** in Google Cloud Console
   (https://console.cloud.google.com → IAM & Admin → Service Accounts → Create).
   Enable the **Search Console API** for the project (APIs & Services → Library).
3. **Make a JSON key** for that service account (Keys → Add key → JSON). It
   downloads a file containing `client_email` and `private_key`.
4. In **Search Console → Settings → Users and permissions → Add user**, add the
   service account's `client_email` with **Full** (or Restricted) access.
5. In Vercel set:
   - `GSC_SERVICE_ACCOUNT_EMAIL` = the `client_email` from the JSON.
   - `GSC_PRIVATE_KEY` = the `private_key` from the JSON (paste the whole
     `-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----` block; literal
     `\n` in the value are handled automatically).
   - `GSC_SITE_URL` = the property exactly as shown in Search Console:
     - domain property → `sc-domain:signaturepianos.com.au`
     - URL-prefix property → `https://signaturepianos.com.au/`

It can take a day or two after verification before Search Console has query data.
If the vars are absent or the call fails, the writer simply falls back to its old
web-search-only behaviour — nothing breaks.

> `CRON_SECRET` is what protects the auto-writer endpoint — Vercel attaches it
> automatically to cron requests. The delivery-reminder cron already uses it.

## 3. Deploy

Push to the branch Vercel builds. No new npm dependencies were added — the
Anthropic calls use `fetch`, so nothing to install.

After deploy:
- `/blog` is live (empty until you publish a post).
- The auto-writer runs **Mon/Wed/Fri at 23:00 UTC** (~9–10am Melbourne). Change
  the schedule in `vercel.json` (`crons` → `/api/cron-blog-writer`).

> **Vercel plan note:** there are now 2 cron jobs (delivery + blog). The Hobby
> plan allows 2 crons at once-per-day frequency — this fits. If you add more,
> you may need the Pro plan.

## 4. Use it

Admin → **Marketing**:
- **Blog tab** → type a topic → *Generate draft* → review in the editor → *Publish*.
- **Website audit tab** → paste a URL → *Run audit*.
- **Auto-writer tab** → *Generate one now* to test the research-and-write loop.

## Cost (rough)

With the default Sonnet model: a blog post ≈ a few cents to ~20¢; an audit ≈ a few
cents. At 2–3 auto posts/week that's a few dollars a month plus whatever you
generate/audit by hand. Switching `AI_MODEL` to Opus roughly doubles per-call cost.

## Files added

```
supabase/blog.sql              # tables + RLS
lib/ai.js                      # Claude (fetch) + admin guard + service client
lib/blog.js                    # post schema, generation, draft save
lib/blog-render.js             # public HTML shell
api/marketing-audit.js         # POST audit (admin)
api/blog-generate.js           # POST generate draft (admin)
api/run-blog-writer.js         # POST run auto-writer now (admin)
api/cron-blog-writer.js        # auto-loop (cron, Mon/Wed/Fri)
api/blog.js                    # GET /blog index
api/blog-post.js               # GET /blog/:slug
api/sitemap.js                 # GET /sitemap.xml
api/llms.js                    # GET /llms.txt
admin/marketing.html           # admin UI
```
Plus a "Marketing" link in the admin sidebar and a "Blog" link in the site nav.

# Google Tag Manager and GA4: setup

The website already loads Tag Manager (container **GTM-WS654V8X**) on signaturepianos.com.au and sends the
events below. What is left happens in Tag Manager and Google Analytics: one GA4 tag, three event tags, and a
few GA4 settings. About 15 minutes.

## What the website sends (live since 5 Nov 2026)

| Event | When | Parameters |
|---|---|---|
| `generate_lead` | the office keeps a form or starts a checkout | `form_type`: `guide`, `viewing`, `enquiry`, `reservation` or `rental`; `page_path` |
| `phone_click` | a tap on any phone number | `link_text`, `page_path` |
| `email_click` | a tap on any email address | `link_text`, `page_path` |

Nothing a visitor types is ever sent to analytics: only which kind of form it was. Where a visitor came from
(the QR code's `?src=`, the `utm_` tags) still goes with every form to the office, as before.

`traffic_type: internal` is sent only from test addresses (Vercel previews, a local run). The live site sends
no `traffic_type`, so GA4's own internal-traffic rule (step 5) decides for it.

The code is `js/analytics.js` (the container ID is at its top) and `js/office.js` (the `generate_lead` push).

## 1. The GA4 Measurement ID

Google Analytics → **Admin** → **Data collection and modification** → **Data streams** → the web stream for
signaturepianos.com.au (create one if there is none) → copy the **Measurement ID** (`G-…`).

## 2. Tag Manager: import the setup

1. tagmanager.google.com → the **Signature Pianos** container (GTM-WS654V8X) → **Admin** → **Import Container**.
2. File: `tools/gtm/signature-pianos-ga4-import.json` (in this repo).
3. Workspace: **Existing** → Default Workspace. Option: **Merge** → **Rename conflicting tags, triggers and
   variables**. Check the preview (4 tags, 3 triggers, 5 variables to add) → **Confirm**.
4. **Variables** → **GA4 Measurement ID** → replace `G-XXXXXXXXXX` with your ID → Save.
5. If the container already had a Google tag for the same `G-` ID, delete one of the two, or page views count
   twice.

If the import refuses the file, set the same things up by hand:

- **Variables** (User-Defined): a **Constant** `GA4 Measurement ID` = your `G-…`; four **Data Layer
  Variables** (version 2): `DLV - form_type` (name `form_type`), `DLV - page_path` (`page_path`),
  `DLV - link_text` (`link_text`), `DLV - traffic_type` (`traffic_type`).
- **Triggers**: three **Custom Event** triggers, `CE - generate_lead`, `CE - phone_click`, `CE - email_click`,
  each with the event name as written.
- **Tags**:
  - **Google tag** `GA4 - Google tag`: Tag ID `{{GA4 Measurement ID}}`; Configuration parameter
    `traffic_type` = `{{DLV - traffic_type}}`; trigger **Initialization - All Pages**.
  - Three **Google Analytics: GA4 Event** tags, each with Measurement ID `{{GA4 Measurement ID}}`:
    `generate_lead` (parameters `form_type`, `page_path`) on `CE - generate_lead`; `phone_click` and
    `email_click` (parameters `link_text`, `page_path`) on their triggers.

## 3. Test before publishing

1. **Preview** → enter `https://signaturepianos.com.au` → the site opens with Tag Assistant attached.
2. Check the **Google tag** fires on Initialization, then tap the phone number in the header: `phone_click`
   fires its tag. Tap the email in the footer: `email_click`.
3. `generate_lead`: send the buyer's guide form on the home page with your own email (it sends you the guide
   and puts you in the office as a guide request; there is no test mode on the live office). Every other form
   becomes a real enquiry or booking in the office, and the office won't delete web enquiries.
4. In GA4 → **Admin** → **DebugView** the same events appear within a minute.

## 4. Publish

**Submit** → Version name `GA4 events (website redesign)` → **Publish**.

## 5. GA4 settings (once the first events arrive, up to 24 hours)

- **Key event**: Admin → **Events** → `generate_lead` → mark as key event (it is what Google Ads can import as a
  conversion later).
- **Custom dimensions**: Admin → **Custom definitions** → Create: `Form type` (Event scope, parameter
  `form_type`); optionally `Link text` (`link_text`). Reports can then split leads by guide, viewing, enquiry
  and reservation.
- **Internal traffic**: Admin → Data streams → the web stream → **Configure tag settings** → **Define internal
  traffic** → add the showroom's and your home's IP addresses (`traffic_type` = `internal`). Then Admin →
  **Data filters** → **Internal Traffic** → set to **Active** (it starts in Testing).
- **Enhanced measurement**: leave it on, but turn **Form interactions** off (Data streams → the web stream →
  Enhanced measurement → cog). Otherwise every form start and every failed send is counted as well as the
  real `generate_lead`.

## For test addresses

On a Vercel preview or a local run Tag Manager doesn't load. Add `?gtm=on` to the address to load it for that
visit (its hits are marked `traffic_type: internal`); `?gtm=off` stops it.

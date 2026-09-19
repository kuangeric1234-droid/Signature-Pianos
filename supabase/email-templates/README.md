# Supabase Auth email templates

Supabase sends the customer portal's sign-in emails itself, so they are set in the dashboard rather than in code.
These two files are the branded versions, built from `lib/email-brand.js`.

In Supabase, go to **Authentication → Email Templates**:

| Template | Subject | Body |
|---|---|---|
| Magic Link | `Your sign-in link — Signature Pianos` | paste `magic-link.html` |
| Confirm signup | `Confirm your email — Signature Pianos` | paste `confirm-signup.html` |

Keep `{{ .ConfirmationURL }}` exactly as it is; Supabase swaps in the real link.

# Mail Admin

Self-service email campaign dashboard for contact management, campaign sending, recipient-level click attribution, and website event analytics.

## Current build

The repository now contains a working Next.js/TypeScript dashboard shell plus the core tracking backend architecture.

### Dashboard
- Overview metrics
- Contacts
- Campaigns
- Campaign composer with dynamic tags
- Recipient-level tracking table
- Live website events
- API/provider settings

### Tracking architecture
1. A campaign creates one `campaign_recipients` row per recipient.
2. Each recipient receives an opaque unique `tracking_token`.
3. Email links point to `/c/:token/:linkId` on Mail Admin.
4. The redirect endpoint records the click and separates obvious scanner/bot user agents.
5. For likely human clicks, Mail Admin creates an attributed website session.
6. The redirect adds an opaque `mt_sid` session value to the destination URL.
7. `public/mail-tracker.js` captures that value on the destination website, removes it from the visible URL, and stores it in `sessionStorage`.
8. The site tracker records page views and explicitly marked events back to `/api/events`.

This lets the dashboard reconstruct a journey such as:

`campaign -> recipient -> click -> website session -> page view -> registration/conversion`

## Technology
- Next.js 15
- TypeScript
- Supabase/PostgreSQL
- Provider-neutral email API layer (Resend first, with SES/Postmark/SendGrid possible later)
- Vercel-compatible deployment

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Database

Run `supabase/schema.sql` in your Supabase SQL editor.

The schema includes:
- `contacts`
- `suppression_list`
- `campaigns`
- `campaign_recipients`
- `tracked_links`
- `sessions`
- `events`
- `provider_webhook_events`

## Environment variables

Copy `.env.example` to `.env.local` and configure values in the deployment environment.

Never commit real API keys or service-role keys to this repository.

`TRACKING_ALLOWED_ORIGINS` is a comma-separated list of websites allowed to submit tracking events. Example:

```env
TRACKING_ALLOWED_ORIGINS=https://example.com,https://www.example.com
```

## Add the website tracker

On the website that email recipients land on:

```html
<script
  src="https://YOUR-MAIL-ADMIN-DOMAIN/mail-tracker.js"
  data-endpoint="https://YOUR-MAIL-ADMIN-DOMAIN/api/events"
  defer
></script>
```

A page view is automatically recorded when the visitor arrived through an attributed campaign session.

To record an important button/action without editing JavaScript:

```html
<button data-mail-track="registration_started" data-mail-label="Start registration">
  Start registration
</button>
```

Or call the tracker manually:

```js
window.MailAdminTracker.track("registration_completed", {
  plan: "starter"
});
```

Do not send passwords, message contents, form field values, payment details, or other sensitive information in event metadata.

## Location and device information

The current backend is designed for approximate country/region metadata supplied by the hosting platform. It does not collect exact GPS coordinates automatically. Precise device location should only be requested when the visitor explicitly grants browser permission.

## Email measurement

Delivery and link clicks are treated as stronger measurements than email opens. Email security systems can automatically inspect links, so click events include an `is_bot` flag and optional `bot_reason`.

## Next implementation stages

1. Connect Supabase environment variables.
2. Replace demo dashboard metrics with live database queries.
3. Add CSV contact import and automatic deduplication.
4. Add the Resend provider adapter and test-send workflow.
5. Add verified provider webhooks for delivery, bounce, complaint, and unsubscribe events.
6. Add campaign audience segmentation and scheduling.
7. Add detailed recipient journey pages and campaign reports.
8. Add authentication before production deployment.

## Security before production

The admin interface must be authenticated before it is deployed with real contact data. Service-role keys and email-provider keys must remain server-side. Suppression/unsubscribe rules should be enforced before every send.

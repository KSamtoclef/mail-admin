# Mail Admin

Self-service email campaign dashboard for contact management, campaign creation, recipient-level click attribution, and website event analytics.

## Current state

The UI contains no fake contacts, campaigns, click rows, or demo metrics. Until Supabase is connected, the dashboard intentionally shows zero values and a connection notice.

The repository includes:
- Next.js 15 + TypeScript dashboard
- environment-based admin login
- live dashboard API
- live campaign draft API
- Supabase/PostgreSQL schema
- unique recipient tracking redirect `/c/:token/:linkId`
- bot/scanner flagging
- attributed website sessions
- public `mail-tracker.js` for the destination website
- `/api/events` website event collector with allowed-origin checks
- `/api/health` deployment/configuration status
- GitHub Actions build verification

## Tracking flow

`campaign -> recipient -> unique tracked link -> click -> attributed session -> website event -> analytics`

A campaign recipient receives an opaque tracking token. When a tracked link is clicked, Mail Admin records the click, separates obvious scanner/bot user agents, creates an attributed session for likely human traffic, and redirects to the real destination. The destination receives an opaque `mt_sid` session value. `public/mail-tracker.js` stores that session in `sessionStorage`, removes it from the visible URL, and submits page/action events back to Mail Admin.

## Deploy on Vercel

1. Import the GitHub repository `KSamtoclef/mail-admin` into Vercel.
2. Keep the detected framework as Next.js and the root directory as `./`.
3. Deploy once. The dashboard can deploy before Supabase/email-provider variables exist; it will show an unconnected zero-data state.
4. Add production environment variables in Vercel Project Settings > Environment Variables.
5. Redeploy after adding or changing environment variables.

### Minimum variables for a protected first deployment

```env
ADMIN_PASSWORD=choose-a-private-admin-password
ADMIN_SESSION_SECRET=choose-a-long-random-secret
TRACKING_BASE_URL=https://YOUR-MAIL-ADMIN.vercel.app
TRACKING_ALLOWED_ORIGINS=https://YOUR-DESTINATION-WEBSITE.com
```

Do not commit real values to GitHub.

## Connect Supabase

Create a Supabase project and run `supabase/schema.sql` in the SQL editor. Then add:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

After redeploying, `/api/health` should report `supabase: true`, and dashboard contacts/campaigns/events will read directly from the database.

## Connect the email provider

The sending layer is intentionally provider-neutral. Add the provider adapter and its server-side credentials only after the provider is selected. Base configuration uses:

```env
EMAIL_PROVIDER=
DEFAULT_FROM_EMAIL=
EMAIL_WEBHOOK_SECRET=
```

Provider API keys must remain server-side environment variables.

## Add tracking to the destination website

```html
<script
  src="https://YOUR-MAIL-ADMIN-DOMAIN/mail-tracker.js"
  data-endpoint="https://YOUR-MAIL-ADMIN-DOMAIN/api/events"
  defer
></script>
```

A page view is recorded only when an attributed Mail Admin session exists.

Mark important actions without adding custom JavaScript:

```html
<button data-mail-track="registration_started" data-mail-label="Start registration">
  Start registration
</button>
```

Or record an explicit event:

```js
window.MailAdminTracker.track("registration_completed", {
  plan: "starter"
});
```

Do not place passwords, message contents, payment data, form field contents, or other sensitive information in tracking metadata.

## Location and measurement limits

The backend supports approximate country/region metadata supplied by the hosting platform. It does not silently collect exact GPS coordinates. Precise location requires explicit browser permission.

Delivery and link clicks are stronger measurements than email opens. Email-security systems can inspect links automatically, so recorded click events include bot/scanner classification fields.

## Useful checks

- `/api/health` — deployment and connection status
- `/login` — protected admin login after `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` are configured
- `/` — live dashboard

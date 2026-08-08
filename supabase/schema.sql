create extension if not exists pgcrypto;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  external_user_id text,
  email text not null,
  email_normalized text generated always as (lower(trim(email))) stored,
  username text,
  country_code text,
  status text not null default 'active' check (status in ('active','suppressed','unsubscribed','bounced')),
  created_at timestamptz not null default now(),
  unique(email_normalized)
);

create table if not exists suppression_list (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  from_name text,
  reply_to text,
  html_body text,
  text_body text,
  audience_filter jsonb not null default '{}'::jsonb,
  tracking_mode text not null default 'clicks_and_site',
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','paused','failed')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  provider_message_id text,
  tracking_token uuid not null default gen_random_uuid(),
  delivery_status text not null default 'queued',
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  unique(campaign_id, contact_id),
  unique(tracking_token)
);

create table if not exists tracked_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  label text,
  destination_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  recipient_id uuid references campaign_recipients(id) on delete set null,
  anonymous_id text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz,
  country_code text,
  region text,
  device_type text,
  browser text,
  os text
);

create table if not exists events (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  event_type text not null,
  campaign_id uuid references campaigns(id) on delete set null,
  recipient_id uuid references campaign_recipients(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  session_id uuid references sessions(id) on delete set null,
  link_id uuid references tracked_links(id) on delete set null,
  page_url text,
  referrer text,
  is_bot boolean not null default false,
  bot_reason text,
  country_code text,
  region text,
  device_type text,
  browser text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists provider_webhook_events (
  id bigserial primary key,
  provider text not null,
  provider_event_id text,
  event_type text not null,
  provider_message_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create index if not exists idx_campaign_recipients_campaign on campaign_recipients(campaign_id);
create index if not exists idx_campaign_recipients_message on campaign_recipients(provider_message_id);
create index if not exists idx_events_campaign_time on events(campaign_id, occurred_at desc);
create index if not exists idx_events_contact_time on events(contact_id, occurred_at desc);
create index if not exists idx_events_session_time on events(session_id, occurred_at desc);
create index if not exists idx_events_type_time on events(event_type, occurred_at desc);

alter table contacts
  add column if not exists broadcast_tracking_token uuid not null default gen_random_uuid();

create unique index if not exists idx_contacts_broadcast_tracking_token
  on contacts(broadcast_tracking_token);

alter table campaigns
  add column if not exists transport text not null default 'resend_broadcast';

create table if not exists campaign_broadcast_waves (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  wave_no integer not null,
  day_key date not null,
  resend_segment_id text,
  resend_broadcast_id text,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  status text not null default 'preparing' check (status in ('preparing','ready','sent','failed')),
  started_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  unique(campaign_id, wave_no),
  unique(resend_broadcast_id)
);

alter table campaign_recipients
  add column if not exists broadcast_wave_id uuid references campaign_broadcast_waves(id) on delete set null;

create index if not exists idx_campaign_broadcast_waves_campaign
  on campaign_broadcast_waves(campaign_id, wave_no desc);

create index if not exists idx_campaign_broadcast_waves_resend
  on campaign_broadcast_waves(resend_broadcast_id);

create index if not exists idx_campaign_recipients_wave
  on campaign_recipients(broadcast_wave_id, contact_id);

create or replace function mail_reserve_broadcast_quota(requested integer)
returns table (
  allowed integer,
  reserved_today bigint,
  daily_send_limit integer,
  remaining_after bigint,
  timezone text,
  sending_paused boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  s send_settings%rowtype;
  local_day date;
  current_reserved integer;
  grant_count integer;
begin
  if requested is null or requested < 1 or requested > 1000000 then
    raise exception 'requested must be between 1 and 1000000';
  end if;

  select * into s from send_settings where id = 1 for update;
  if not found then
    raise exception 'send settings are not configured';
  end if;

  local_day := (now() at time zone s.timezone)::date;

  insert into send_daily_counters(day_key, timezone, reserved_count)
  values (local_day, s.timezone, 0)
  on conflict (day_key, timezone) do nothing;

  select reserved_count into current_reserved
  from send_daily_counters
  where day_key = local_day and timezone = s.timezone
  for update;

  if s.sending_paused then
    grant_count := 0;
  else
    grant_count := greatest(least(requested, s.daily_send_limit - current_reserved), 0);
  end if;

  if grant_count > 0 then
    update send_daily_counters
    set reserved_count = reserved_count + grant_count,
        updated_at = now()
    where day_key = local_day and timezone = s.timezone;
  end if;

  return query
  select
    grant_count,
    current_reserved::bigint,
    s.daily_send_limit,
    greatest(s.daily_send_limit - current_reserved - grant_count, 0)::bigint,
    s.timezone,
    s.sending_paused;
end;
$$;

create or replace function mail_release_send_quota(release_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s send_settings%rowtype;
  local_day date;
  remaining integer;
begin
  if release_count is null or release_count < 1 then
    return 0;
  end if;

  select * into s from send_settings where id = 1;
  if not found then
    raise exception 'send settings are not configured';
  end if;

  local_day := (now() at time zone s.timezone)::date;

  update send_daily_counters
  set reserved_count = greatest(reserved_count - release_count, 0),
      updated_at = now()
  where day_key = local_day and timezone = s.timezone
  returning reserved_count into remaining;

  return coalesce(remaining, 0);
end;
$$;

create table if not exists send_settings (
  id smallint primary key default 1 check (id = 1),
  daily_send_limit integer not null default 500 check (daily_send_limit between 1 and 1000000),
  max_batch_size integer not null default 100 check (max_batch_size between 1 and 100),
  timezone text not null default 'Africa/Lagos',
  sending_paused boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into send_settings (id, daily_send_limit, max_batch_size, timezone, sending_paused)
values (1, 500, 100, 'Africa/Lagos', false)
on conflict (id) do nothing;

create or replace function mail_daily_send_usage()
returns table (
  sent_today bigint,
  daily_send_limit integer,
  remaining_today bigint,
  max_batch_size integer,
  timezone text,
  sending_paused boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(cr.id) filter (
      where cr.sent_at is not null
        and (cr.sent_at at time zone s.timezone)::date = (now() at time zone s.timezone)::date
    ) as sent_today,
    s.daily_send_limit,
    greatest(
      s.daily_send_limit - count(cr.id) filter (
        where cr.sent_at is not null
          and (cr.sent_at at time zone s.timezone)::date = (now() at time zone s.timezone)::date
      ),
      0
    )::bigint as remaining_today,
    s.max_batch_size,
    s.timezone,
    s.sending_paused
  from send_settings s
  left join campaign_recipients cr on true
  where s.id = 1
  group by s.daily_send_limit, s.max_batch_size, s.timezone, s.sending_paused;
$$;

-- The Night Shop: lock-screen alerts. Paste this whole file into Supabase > SQL Editor > Run.
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh_key text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;   -- no policies: only the server can read it

create or replace function public.register_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.push_subscriptions(endpoint, user_id, p256dh_key, auth_key)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh_key = excluded.p256dh_key, auth_key = excluded.auth_key;
end $$;

create or replace function public.unregister_push(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

revoke all on function public.register_push(text, text, text) from public, anon;
revoke all on function public.unregister_push(text) from public, anon;
grant execute on function public.register_push(text, text, text) to authenticated;
grant execute on function public.unregister_push(text) to authenticated;

-- Calls the "push" edge function after an order or message changes. It can never block an order or message.
create or replace function public.nightshop_push_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  begin
    perform net.http_post(
      url := 'https://yppuanqofgpiskffiyvf.supabase.co/functions/v1/push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcHVhbnFvZmdwaXNrZmZpeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MTI1MDgsImV4cCI6MjEwOTI4ODUwOH0.tYoFrt1PQ7Ur-XioMyb_SzdDnJwjNUcJw3VXPy_zQAI',
        'x-push-secret', '__PUSH_SECRET__'),
      body := jsonb_build_object('table', TG_TABLE_NAME, 'type', TG_OP, 'record', to_jsonb(NEW),
                                 'old_record', case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end));
  exception when others then
    null;
  end;
  return null;
end $$;
revoke all on function public.nightshop_push_notify() from public, anon, authenticated;

drop trigger if exists nightshop_push_orders_ins on public.orders;
create trigger nightshop_push_orders_ins after insert on public.orders for each row execute function public.nightshop_push_notify();
drop trigger if exists nightshop_push_orders_upd on public.orders;
create trigger nightshop_push_orders_upd after update of status on public.orders for each row
  when (old.status is distinct from new.status) execute function public.nightshop_push_notify();
drop trigger if exists nightshop_push_msgs_ins on public.messages;
create trigger nightshop_push_msgs_ins after insert on public.messages for each row execute function public.nightshop_push_notify();
drop trigger if exists nightshop_push_msgs_upd on public.messages;
create trigger nightshop_push_msgs_upd after update of reply on public.messages for each row
  when (old.reply is distinct from new.reply) execute function public.nightshop_push_notify();

-- Help requests from the shadowman window outside (people locked out / with questions).
-- Anyone, even signed out, can leave one note through send_help_request (capped at 15 per hour).
-- Only the shop owner can read or delete them.
create table if not exists public.help_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  contact text not null check (char_length(contact) between 1 and 120),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.help_requests enable row level security;

drop policy if exists "Owner reads help requests" on public.help_requests;
create policy "Owner reads help requests" on public.help_requests for select to authenticated using (private.is_shop_owner());
drop policy if exists "Owner deletes help requests" on public.help_requests;
create policy "Owner deletes help requests" on public.help_requests for delete to authenticated using (private.is_shop_owner());

create or replace function public.send_help_request(p_name text, p_contact text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  p_name := btrim(coalesce(p_name, '')); p_contact := btrim(coalesce(p_contact, '')); p_message := btrim(coalesce(p_message, ''));
  if p_name = '' or p_contact = '' or p_message = '' then raise exception 'Please fill in your name, how to reach you, and your message.'; end if;
  if char_length(p_name) > 80 or char_length(p_contact) > 120 or char_length(p_message) > 1000 then raise exception 'That is too long.'; end if;
  if (select count(*) from public.help_requests where created_at > now() - interval '1 hour') >= 15 then
    raise exception 'Too many requests right now. Please try again later.';
  end if;
  insert into public.help_requests(name, contact, message) values (p_name, p_contact, p_message);
end $$;
revoke all on function public.send_help_request(text,text,text) from public;
grant execute on function public.send_help_request(text,text,text) to anon, authenticated;

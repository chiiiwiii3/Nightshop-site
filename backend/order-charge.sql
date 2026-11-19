-- Charges an order to the member's balance the first time the owner Confirms or Waitlists it.
-- A later Deny removes that charge. Safe to run more than once.
alter table public.ledger add column if not exists order_id uuid unique references public.orders(id) on delete set null;
create or replace function public.nightshop_charge_order() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('confirmed','waitlisted') and new.customer_id is not null and coalesce(new.total_amount,0) > 0 then
    insert into public.ledger (customer_id, amount, note, order_id)
    values (new.customer_id, new.total_amount, left('Order: ' || new.item || ' x' || new.quantity, 190), new.id)
    on conflict (order_id) do nothing;
  elsif new.status = 'denied' then
    delete from public.ledger where order_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists nightshop_charge_order_upd on public.orders;
create trigger nightshop_charge_order_upd after update of status on public.orders for each row when (old.status is distinct from new.status) execute function public.nightshop_charge_order();
revoke all on function public.nightshop_charge_order() from public, anon, authenticated;

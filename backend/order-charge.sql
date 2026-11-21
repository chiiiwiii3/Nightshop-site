-- The ledger links to an order (one charge per order). The owner's "Add to balance" button on each order card uses it.
-- (The automatic charge on Confirm/Waitlist was removed again; the trigger and function were dropped.)
alter table public.ledger add column if not exists order_id uuid unique references public.orders(id) on delete set null;

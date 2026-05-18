-- =============================================================================
-- SIGNATURE PIANOS — piano cost tracking + service log + auto-recalc trigger
-- =============================================================================
-- Run AFTER missing_tables.sql in the Supabase SQL editor.
-- Safe to re-run: every object uses IF NOT EXISTS / DROP-then-CREATE.
--
-- The cost picture for a piano is:
--   base_cost            — what we paid the supplier (or quarantine bond etc.)
--   purchase_date        — when we took possession
--   purchase_notes       — free text (lot #, source, anything Eric wants)
--   piano_service_log.*  — every dollar spent prepping or repairing the unit
--   cost_price           — base_cost + SUM(piano_service_log.cost)
--                          AUTO-RECALCULATED by trigger on every change
-- =============================================================================


-- ---------- pianos: cost-tracking columns ---------------------------------
alter table pianos add column if not exists base_cost      numeric(10,2) default 0;
alter table pianos add column if not exists cost_price     numeric(10,2) default 0;
alter table pianos add column if not exists purchase_date  date;
alter table pianos add column if not exists purchase_notes text;


-- ---------- piano_service_log --------------------------------------------
-- One row per service / repair / refurb job. Cost is what was paid out for
-- that line — labour, parts, tuning, regulation, voicing, cabinet repairs,
-- transport, anything that goes into the total cost picture.
create table if not exists piano_service_log (
  id            uuid default gen_random_uuid() primary key,
  piano_id      uuid not null references pianos(id) on delete cascade,
  service_date  date not null default current_date,
  service_type  text not null,
  description   text,
  cost          numeric(10,2) not null default 0,
  performed_by  text,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_psl_piano_id     on piano_service_log(piano_id);
create index if not exists idx_psl_service_date on piano_service_log(service_date desc);


-- ---------- RLS -----------------------------------------------------------
alter table piano_service_log enable row level security;

drop policy if exists "Admin full access — piano_service_log" on piano_service_log;
create policy "Admin full access — piano_service_log"
on piano_service_log for all
to authenticated
using (is_admin())
with check (is_admin());


-- ---------- updated_at trigger -------------------------------------------
drop trigger if exists trg_set_updated_at on piano_service_log;
create trigger trg_set_updated_at
before update on piano_service_log
for each row execute function set_updated_at();


-- ---------- Auto-recalc of pianos.cost_price -----------------------------
-- Whenever a service-log row is inserted, updated or deleted, recompute
-- the parent piano's cost_price as base_cost + SUM(service_log.cost).
-- We update both the row that's coming in (NEW.piano_id) and the row that's
-- going out (OLD.piano_id) so re-parenting a log entry stays consistent.
create or replace function recalc_piano_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
  pid uuid;
begin
  -- Collect every affected piano id (handles INSERT, UPDATE, DELETE).
  if (tg_op = 'DELETE') then
    ids := array[old.piano_id];
  elsif (tg_op = 'INSERT') then
    ids := array[new.piano_id];
  else
    if old.piano_id is distinct from new.piano_id then
      ids := array[new.piano_id, old.piano_id];
    else
      ids := array[new.piano_id];
    end if;
  end if;

  foreach pid in array ids loop
    if pid is null then continue; end if;
    update pianos p
       set cost_price = coalesce(p.base_cost, 0) +
                        coalesce((select sum(cost)
                                    from piano_service_log
                                   where piano_id = pid), 0)
     where p.id = pid;
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalc_piano_cost on piano_service_log;
create trigger trg_recalc_piano_cost
after insert or update or delete on piano_service_log
for each row execute function recalc_piano_cost();


-- ---------- Backfill: existing pianos with no service log get base_cost --
-- Pianos that haven't been edited yet stay at cost_price = base_cost = 0,
-- which is fine — the trigger only fires on service_log changes.
update pianos
   set cost_price = coalesce(base_cost, 0)
 where cost_price is null;

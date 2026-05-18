-- =============================================================================
-- SIGNATURE PIANOS — bulk cost-price import (per-serial)
-- =============================================================================
-- Run AFTER inventory_updates.sql. Safe to re-run.
--
-- We write to BOTH base_cost and cost_price:
--   * base_cost  — the supplier / purchase price, used by the recalc trigger
--                  on piano_service_log as the floor for cost_price.
--   * cost_price — set explicitly so the value is visible immediately, before
--                  any service-log entries exist.
--
-- If service-log entries are later added/edited/deleted, the trigger
-- (recalc_piano_cost) will recompute cost_price as base_cost + SUM(log.cost),
-- which stays correct because we seeded base_cost here.
-- =============================================================================

update pianos set base_cost = 3873.29, cost_price = 3873.29 where serial_number = '4602912';
update pianos set base_cost = 2811.36, cost_price = 2811.36 where serial_number = '4883906';
update pianos set base_cost = 4772.06, cost_price = 4772.06 where serial_number = '5023413';
update pianos set base_cost = 3973.29, cost_price = 3973.29 where serial_number = '4582870';
update pianos set base_cost = 3477.20, cost_price = 3477.20 where serial_number = '3843471';
update pianos set base_cost = 3577.20, cost_price = 3577.20 where serial_number = '3883323';
update pianos set base_cost = 3640.37, cost_price = 3640.37 where serial_number = '4127619';
update pianos set base_cost = 2911.36, cost_price = 2911.36 where serial_number = '3251796';
update pianos set base_cost = 3011.36, cost_price = 3011.36 where serial_number = '3369093';
update pianos set base_cost = 3011.36, cost_price = 3011.36 where serial_number = '3373022';
update pianos set base_cost = 2911.36, cost_price = 2911.36 where serial_number = '3449002';
update pianos set base_cost = 2711.36, cost_price = 2711.36 where serial_number = '3594835';
update pianos set base_cost = 4182.55, cost_price = 4182.55 where serial_number = '5972821';
update pianos set base_cost = 4395.72, cost_price = 4395.72 where serial_number = '6174393';
update pianos set base_cost = 5640.57, cost_price = 5640.57 where serial_number = '6202566';
update pianos set base_cost = 2847.69, cost_price = 2847.69 where serial_number = '2405497';

-- Re-sync cost_price for any of the rows above that already have service-log
-- entries — keeps the trigger invariant (cost_price = base_cost + SUM(log)).
update pianos p
   set cost_price = coalesce(p.base_cost, 0) +
                    coalesce((select sum(cost) from piano_service_log s where s.piano_id = p.id), 0)
 where p.serial_number in (
   '4602912','4883906','5023413','4582870','3843471','3883323','4127619','3251796',
   '3369093','3373022','3449002','3594835','5972821','6174393','6202566','2405497'
 );

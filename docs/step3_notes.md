# Step 3 notes: compute (instances, scheduler, quotas)

## New objects
Tables: instances, ip_addresses (12 tables in total after this step)
Functions: fn_org_active_instances, fn_org_quota_left
Procedures: sp_launch_instance (scheduler), sp_allocate_ip, sp_set_instance_status, sp_terminate_instance
Triggers on instances: bi_rules, ai_capacity, bu_rules, au_effects, bd_block
Views: v_instances, v_org_quota

## Viva points
| Topic | Explanation |
|---|---|
| Scheduler | Best fit (fullest host that still has room). `FOR UPDATE SKIP LOCKED` skips host rows locked by concurrent launches, so two launches never get the same slot and nobody waits. |
| Transaction | Host selection, instance insert, IP allocation commit together; EXIT HANDLER rolls everything back on any error. |
| Where rules live | Quota, org active, image disk size, host state and capacity are checked in a BEFORE INSERT trigger, so they hold for every writer, not only our API. |
| Denormalized counters | hosts.used_* updated by AFTER INSERT / AFTER UPDATE triggers; CHECK (used <= total) is the last line of defence; Step 6 consistency check verifies them. |
| Generated columns | `auto_backup` (from JSON config) and `live_name` (NULL when terminated, so a UNIQUE key allows reusing names of terminated instances). |
| Status machine | running / stopped / suspended / terminated with allowed transitions enforced by trigger; terminated is final and read-only. |
| Immutability | Instances are never deleted (billing history); BEFORE DELETE trigger blocks it. |
| Row locking | sp_set_instance_status locks the instance row with FOR UPDATE, so concurrent changes are serialized. |
| Tenant safety | The API takes org_id from the login token, never from the request; the procedure also checks ownership. Customers get an explicit column list without host names. |

## Known limit to mention
Resize (changing type or host) is deliberately blocked by trg_instances_bu_rules for now; a later step adds a resize procedure and updates that trigger.

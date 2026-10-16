# Step 4 notes: storage and network

## New objects
Tables: volumes, snapshots, domains, dns_records (16 tables in total after this step)
Functions: fn_org_storage_used, fn_org_storage_left, fn_instance_volume_count
Procedures: sp_create_volume, sp_attach_volume, sp_detach_volume, sp_resize_volume, sp_delete_volume,
            sp_take_snapshot, sp_restore_snapshot, sp_delete_snapshot, sp_register_domain, sp_renew_domain,
            sp_validate_dns_record (called by the DNS triggers)
Triggers: volumes (5), snapshots (3), domains (5), dns_records (5) and the replaced trg_instances_au_effects
Views: v_volumes, v_snapshots, v_org_storage, v_domains, v_org_ips

## Viva points
| Topic | Explanation |
|---|---|
| Quota under concurrency | sp_create_volume / sp_restore_snapshot / sp_resize_volume lock the organization row (SELECT ... FOR UPDATE) before checking storage, so two simultaneous requests cannot both fit under the quota. |
| Rules for every writer | Attach rules (same org, same region, instance alive, max 5 volumes) live in trg_volumes_bu_rules, not only in the procedure. |
| State consistency | "status = attached exactly when instance_id is set" cannot be a CHECK (instance_id has ON DELETE SET NULL, and MySQL forbids CHECK on such columns), so a trigger enforces it. |
| Soft delete | Volumes are never deleted (BEFORE DELETE blocks it); status = deleted plus generated column live_name = NULL lets the name be reused. |
| Evolving a trigger | 12_storage_programs.sql drops and recreates trg_instances_au_effects (Step 3) so terminating an instance also detaches its volumes. The Step 3 file is unchanged: migrations are append-only. |
| Cross-table validation | sp_validate_dns_record is shared by the insert and update triggers: IPv4/IPv6 checks, CNAME exclusivity, MX priority, expired-domain block, and a tenant rule (an A record cannot point to another organization's IP). |
| Cascade rules | dns_records -> domains ON DELETE CASCADE (records belong to the domain); snapshots -> volumes RESTRICT; volumes.instance_id ON DELETE SET NULL. |
| Deadlock | Attach locks volume then instance; terminate locks instance then volumes. This lock-order inversion is a real deadlock risk, shown in test T-S4-18; the API turns error 1213 into a retry message. |
| Views | v_domains computes days_left and state (active / expiring / expired) with CASE and DATEDIFF. |
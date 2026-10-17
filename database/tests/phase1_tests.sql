-- Phase 1 Acceptance Tests - run with: mysql -u deku -p1234 nimbushost --force < database/tests/phase1_tests.sql
-- --force continues after errors so we see all results

-- Reset database first
SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM payments;
DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM dns_records;
DELETE FROM domains;
DELETE FROM snapshots;
DELETE FROM volumes;
DELETE FROM ip_addresses;
DELETE FROM instances;
DELETE FROM hosts;
DELETE FROM images;
DELETE FROM pricing;
DELETE FROM instance_types;
DELETE FROM regions;
DELETE FROM org_members;
DELETE FROM api_keys;
DELETE FROM refresh_tokens;
DELETE FROM users;
DELETE FROM organizations;
DELETE FROM account_tiers;
DELETE FROM audit_log;
SET FOREIGN_KEY_CHECKS = 1;

-- Seed minimal test data
INSERT INTO account_tiers(name, max_instances, max_storage_gb) VALUES ('starter', 5, 100);
INSERT INTO organizations(name, tier_id) VALUES ('TestOrg', 1);
INSERT INTO users(email, password_hash, full_name) VALUES ('test@test.com', '$2b$12$dummyhashvalue000000000000000000000000000000000000', 'Test User');
INSERT INTO org_members(org_id, user_id, member_role) VALUES (1, 1, 'owner');
INSERT INTO regions(code, name, country) VALUES ('us-east-1', 'US East', 'USA');
INSERT INTO hosts(region_id, hostname, total_vcpu, total_ram_gb, total_disk_gb) VALUES (1, 'host-01', 64, 128, 1000);
INSERT INTO instance_types(name, vcpu, ram_gb, disk_gb) VALUES ('t2.small', 1, 2, 20);
INSERT INTO images(name, os_family, version) VALUES ('Ubuntu', 'linux', '22.04');
INSERT INTO pricing(type_id, price_per_hour, valid_from) VALUES (1, 0.0500, '2026-01-01');

SELECT 'SETUP COMPLETE' AS status;

-- ================================================================
-- T06: CHECK constraint violations (each should produce error 3819)
-- ================================================================

SELECT 'T06a: negative credit balance' AS test;
INSERT INTO organizations(name, tier_id, credit_balance) VALUES ('BadOrg', 1, -100);

SELECT 'T06b: discount > 50' AS test;
INSERT INTO account_tiers(name, max_instances, max_storage_gb, discount_pct) VALUES ('bad-tier', 10, 100, 60);

SELECT 'T06c: host used > total' AS test;
INSERT INTO hosts(region_id, hostname, total_vcpu, total_ram_gb, total_disk_gb, used_vcpu) VALUES (1, 'bad-host', 4, 8, 100, 5);

SELECT 'T06d: negative price' AS test;
INSERT INTO pricing(type_id, price_per_hour, valid_from) VALUES (1, -1.00, '2030-01-01');

SELECT 'T06e: volume size > 16000' AS test;
INSERT INTO volumes(org_id, region_id, name, size_gb) VALUES (1, 1, 'bad-vol-aa', 20000);

SELECT 'T06f: dns ttl below minimum' AS test;
INSERT INTO domains(org_id, name, registered_on, expires_on) VALUES (1, 'test.com', '2026-01-01', '2027-01-01');
INSERT INTO dns_records(domain_id, rtype, name, value, ttl) VALUES (LAST_INSERT_ID(), 'A', '@', '1.2.3.4', 10);

SELECT 'T06g: invoice total mismatch' AS test;
INSERT INTO invoices(org_id, period_start, period_end, subtotal, tax, credit_applied, total) VALUES (1, '2026-01-01', '2026-01-31', 100.00, 10.00, 0.00, 999.00);

SELECT 'T06h: payment amount <= 0' AS test;
INSERT INTO invoices(org_id, period_start, period_end, subtotal, tax, credit_applied, total) VALUES (1, '2026-02-01', '2026-02-28', 100.00, 10.00, 0.00, 110.00);
INSERT INTO payments(invoice_id, amount, method, txn_ref) VALUES (LAST_INSERT_ID(), -50.00, 'card', 'txn-001');

SELECT 'T06i: domain expires before registration' AS test;
INSERT INTO domains(org_id, name, registered_on, expires_on) VALUES (1, 'bad.com', '2027-01-01', '2026-01-01');

SELECT 'T06j: instance type specs <= 0' AS test;
INSERT INTO instance_types(name, vcpu, ram_gb, disk_gb) VALUES ('bad-type', 0, 2, 20);

-- ================================================================
-- T07: RESTRICT FK violations (each should produce error 1451)
-- ================================================================

SELECT 'T07a: delete tier with orgs' AS test;
DELETE FROM account_tiers WHERE tier_id = 1;

SELECT 'T07b: delete region with hosts' AS test;
DELETE FROM regions WHERE region_id = 1;

SELECT 'T07c: delete instance_type with pricing' AS test;
DELETE FROM instance_types WHERE type_id = 1;

SELECT 'T07d: delete org with members (CASCADE test - should succeed)' AS test;
INSERT INTO organizations(name, tier_id) VALUES ('CascadeTest', 1);
INSERT INTO users(email, password_hash, full_name) VALUES ('cascade@test.com', '$2b$12$dummyhashvalue000000000000000000000000000000000000', 'Cascade');
INSERT INTO org_members(org_id, user_id) VALUES (LAST_INSERT_ID(), LAST_INSERT_ID());
-- This should succeed due to CASCADE on org_members
SELECT COUNT(*) AS members_before FROM org_members WHERE org_id = (SELECT org_id FROM organizations WHERE name = 'CascadeTest');

-- ================================================================
-- T08: UNIQUE constraint violations (each should produce error 1062)
-- ================================================================

SELECT 'T08a: duplicate org name' AS test;
INSERT INTO organizations(name, tier_id) VALUES ('TestOrg', 1);

SELECT 'T08b: duplicate user email' AS test;
INSERT INTO users(email, password_hash, full_name) VALUES ('test@test.com', '$2b$12$different', 'Dupe');

SELECT 'T08c: duplicate hostname' AS test;
INSERT INTO hosts(region_id, hostname, total_vcpu, total_ram_gb, total_disk_gb) VALUES (1, 'host-01', 32, 64, 500);

SELECT 'T08d: duplicate pricing start date for same type' AS test;
INSERT INTO pricing(type_id, price_per_hour, valid_from) VALUES (1, 0.1000, '2026-01-01');

SELECT 'T08e: duplicate txn_ref' AS test;
INSERT INTO invoices(org_id, period_start, period_end, subtotal, tax, credit_applied, total) VALUES (1, '2026-03-01', '2026-03-31', 50.00, 5.00, 0.00, 55.00);
SET @inv_id = LAST_INSERT_ID();
INSERT INTO payments(invoice_id, amount, method, txn_ref) VALUES (@inv_id, 55.00, 'card', 'txn-unique-1');
INSERT INTO payments(invoice_id, amount, method, txn_ref) VALUES (@inv_id, 55.00, 'card', 'txn-unique-1');

SELECT 'T08f: duplicate ip_address' AS test;
INSERT INTO ip_addresses(region_id, ip_address) VALUES (1, '10.0.0.1');
INSERT INTO ip_addresses(region_id, ip_address) VALUES (1, '10.0.0.1');

SELECT '=== ALL PHASE 1 TESTS COMPLETE ===' AS result;


-- Reference data for Step 1 (users are created by: npm run seed-users)
INSERT INTO account_tiers(name, max_instances, max_storage_gb, discount_pct) VALUES
  ('Free',        2,    50,  0),
  ('Starter',     10,   500, 0),
  ('Business',    50,   5000, 5),
  ('Enterprise',  500,  100000, 15);

INSERT INTO organizations(name, tier_id) VALUES
  ('NimbusHost Internal', (SELECT tier_id FROM account_tiers WHERE name = 'Enterprise')),
  ('Acme Robotics',       (SELECT tier_id FROM account_tiers WHERE name = 'Starter'));

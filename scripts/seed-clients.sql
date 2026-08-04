-- CodePay Billing: Seed Clients + Rate Plans
-- Run AFTER schema.sql, BEFORE seed-historical.sql

-- Clients
INSERT INTO clients (name, status, billing_type, payment_method, notes) VALUES
('Universal Processing', 'active', 'manual', 'other', NULL),
('ZBS POS', 'active', 'manual', 'other', 'Rate drops to $1 once volume crosses ~10k units/month'),
('Ant Fintech', 'active', 'auto_charge', 'card', NULL),
('MCPOS', 'active', 'manual', 'other', NULL),
('Icon Payments', 'active', 'manual', 'other', NULL),
('AARPUS', 'active', 'manual', 'other', NULL),
('OKMerchat', 'active', 'manual', 'other', NULL),
('Long Merchants', 'active', 'auto_charge', 'card', NULL),
('Lianup', 'active', 'manual', 'other', 'Rate changed from $2 to $2.95 in Dec 2025'),
('ABC POS', 'active', 'manual', 'other', '$20/same location cap'),
('Retech Payment', 'active', 'auto_charge', 'card', NULL),
('FMS', 'active', 'auto_charge', 'card', '1st: $3.95; 2nd+: $2.95. $20/same location cap. New credit card on file.'),
('Peblla', 'active', 'manual', 'other', 'Consolidated with FMS'),
('EBSPOS', 'active', 'auto_charge', 'card', NULL),
('Wayvvy Payment', 'active', 'manual', 'other', NULL),
('All-in-One', 'active', 'manual', 'other', NULL),
('Touch Plus', 'active', 'auto_charge', 'card', NULL),
('Honor POS', 'active', 'manual', 'other', 'Honor pays with Icon Payments — never billed directly'),
('Koam', 'active', 'manual', 'other', 'New client, no activity yet'),
('UNBS', 'active', 'manual', 'other', '1st: $3.95; 2nd+: $2.95. $20/same location'),
('Fides', 'active', 'manual', 'other', 'New client'),
('NavyZ', 'active', 'manual', 'other', '1st: $2.95; 2nd+: $1.95. $20/same location');

-- Set parent_client_id for consolidated accounts
UPDATE clients SET parent_client_id = (SELECT id FROM clients WHERE name = 'FMS') WHERE name = 'Peblla';
UPDATE clients SET parent_client_id = (SELECT id FROM clients WHERE name = 'Icon Payments') WHERE name = 'Honor POS';

-- Rate Plans
INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2025-05-01', 'flat_per_unit', 1.00, NULL FROM clients WHERE name = 'Universal Processing';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2025-05-01', 'flat_per_unit', 2.00, 'Rate drops to $1 once volume crosses ~10k units/month' FROM clients WHERE name = 'ZBS POS';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2025-06-01', 'flat_per_unit', 2.00, NULL FROM clients WHERE name = 'Ant Fintech';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2025-05-01', 'flat_per_unit', 2.95, NULL FROM clients WHERE name = 'MCPOS';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2025-11-01', 'flat_per_unit', 2.00, NULL FROM clients WHERE name = 'Icon Payments';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2025-10-01', 'flat_per_unit', 2.95, NULL FROM clients WHERE name = 'AARPUS';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2025-11-01', 'flat_per_unit', 2.95, NULL FROM clients WHERE name = 'OKMerchat';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2025-10-01', 'flat_per_unit', 2.95, NULL FROM clients WHERE name = 'Long Merchants';

-- Lianup: original rate $2, then changed to $2.95
INSERT INTO rate_plans (client_id, effective_start, effective_end, pricing_model, flat_rate, notes)
SELECT id, '2025-10-01', '2025-11-30', 'flat_per_unit', 2.00, 'Original rate before change to $2.95' FROM clients WHERE name = 'Lianup';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2025-12-01', 'flat_per_unit', 2.95, 'Rate changed from $2 to $2.95' FROM clients WHERE name = 'Lianup';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, cap_amount, cap_scope, notes)
SELECT id, '2025-04-01', 'flat_per_unit', 3.95, 20.00, 'per_client', '$20/same location cap' FROM clients WHERE name = 'ABC POS';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2026-01-01', 'flat_per_unit', 2.95, NULL FROM clients WHERE name = 'Retech Payment';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, tier_1_rate, tier_1_unit_count, tier_2_rate, cap_amount, cap_scope, notes)
SELECT id, '2025-04-01', 'tiered_per_unit', 3.95, 1, 2.95, 20.00, 'per_client', '1st: $3.95; 2nd+: $2.95. $20/same location cap' FROM clients WHERE name = 'FMS';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2025-03-01', 'flat_per_unit', 3.95, 'Consolidated with FMS' FROM clients WHERE name = 'Peblla';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2026-05-01', 'flat_per_unit', 2.95, NULL FROM clients WHERE name = 'EBSPOS';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2026-05-01', 'flat_per_unit', 3.95, NULL FROM clients WHERE name = 'Wayvvy Payment';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2026-05-01', 'flat_per_unit', 3.95, NULL FROM clients WHERE name = 'All-in-One';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, notes)
SELECT id, '2026-05-01', 'flat_per_unit', 3.95, NULL FROM clients WHERE name = 'Touch Plus';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, tier_1_rate, tier_1_unit_count, tier_2_rate, cap_amount, cap_scope, notes)
SELECT id, '2026-07-01', 'tiered_per_unit', 3.95, 1, 2.95, 20.00, 'per_client', '1st: $3.95; 2nd+: $2.95. $20/same location' FROM clients WHERE name = 'UNBS';

INSERT INTO rate_plans (client_id, effective_start, pricing_model, tier_1_rate, tier_1_unit_count, tier_2_rate, cap_amount, cap_scope, notes)
SELECT id, '2026-07-01', 'tiered_per_unit', 2.95, 1, 1.95, 20.00, 'per_client', '1st: $2.95; 2nd+: $1.95. $20/same location' FROM clients WHERE name = 'NavyZ';

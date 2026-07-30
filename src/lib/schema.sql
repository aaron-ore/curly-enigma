-- CodePay Client Billing App — Database Schema
-- Per spec section 2, with section 8 simplification (charges + payments merged)

-- Enum types
CREATE TYPE client_status AS ENUM ('active', 'inactive', 'pending');
CREATE TYPE billing_type AS ENUM ('auto_charge', 'manual');
CREATE TYPE payment_method_type AS ENUM ('card', 'ach', 'check', 'wire', 'other');
CREATE TYPE pricing_model_type AS ENUM ('flat_per_unit', 'tiered_per_unit');
CREATE TYPE cap_scope_type AS ENUM ('per_client', 'per_location');
CREATE TYPE usage_source_type AS ENUM ('imported', 'manual', 'imported_overridden');
CREATE TYPE charge_status_type AS ENUM ('pending', 'charged', 'paid', 'overdue', 'disputed', 'waived', 'consolidated');
CREATE TYPE test_flag_type AS ENUM ('auto_excluded', 'review_full_refund', 'review_low_value');

-- Clients table
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status client_status NOT NULL DEFAULT 'active',
  billing_type billing_type NOT NULL DEFAULT 'manual',
  payment_method payment_method_type DEFAULT 'other',
  parent_client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Locations table (optional per spec, included for per-location caps)
CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL
);

-- Rate plans table (effective-dated, never overwrite history)
CREATE TABLE rate_plans (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  effective_start DATE NOT NULL,
  effective_end DATE,
  pricing_model pricing_model_type NOT NULL DEFAULT 'flat_per_unit',
  flat_rate NUMERIC(10, 4),
  tier_1_rate NUMERIC(10, 4),
  tier_1_unit_count INTEGER,
  tier_2_rate NUMERIC(10, 4),
  cap_amount NUMERIC(10, 2),
  cap_scope cap_scope_type,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Terminal-to-client mapping (effective-dated for reassignments)
CREATE TABLE terminal_client_map (
  id SERIAL PRIMARY KEY,
  terminal_id VARCHAR(50) NOT NULL,
  store_name VARCHAR(255),
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  effective_start DATE NOT NULL,
  effective_end DATE
);

CREATE INDEX idx_terminal_map_terminal ON terminal_client_map(terminal_id);
CREATE INDEX idx_terminal_map_client ON terminal_client_map(client_id);

-- PayPilot import batches
CREATE TABLE paypilot_imports (
  id SERIAL PRIMARY KEY,
  billing_month DATE NOT NULL,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  imported_by VARCHAR(255),
  source_file_name VARCHAR(500),
  row_count INTEGER DEFAULT 0
);

-- PayPilot raw transaction data (terminal-level summaries)
CREATE TABLE paypilot_transactions (
  id SERIAL PRIMARY KEY,
  import_id INTEGER NOT NULL REFERENCES paypilot_imports(id) ON DELETE CASCADE,
  store_name VARCHAR(255),
  store_type VARCHAR(50),
  terminal_sn VARCHAR(50) NOT NULL,
  purchase_qty INTEGER DEFAULT 0,
  purchase_amount NUMERIC(12, 2) DEFAULT 0,
  refund_qty INTEGER DEFAULT 0,
  refund_amount NUMERIC(12, 2) DEFAULT 0,
  discount NUMERIC(12, 2) DEFAULT 0,
  fee NUMERIC(12, 2) DEFAULT 0,
  vat NUMERIC(12, 2) DEFAULT 0,
  merchant_receivable NUMERIC(12, 2) DEFAULT 0,
  test_flag test_flag_type,
  included_in_active_count BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_paypilot_tx_import ON paypilot_transactions(import_id);
CREATE INDEX idx_paypilot_tx_terminal ON paypilot_transactions(terminal_sn);

-- Usage records (one per client per billing month)
CREATE TABLE usage_records (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  billing_month DATE NOT NULL,
  active_units INTEGER NOT NULL DEFAULT 0,
  source usage_source_type NOT NULL DEFAULT 'manual',
  source_import_id INTEGER REFERENCES paypilot_imports(id) ON DELETE SET NULL,
  calculated_total NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, billing_month)
);

CREATE INDEX idx_usage_client_month ON usage_records(client_id, billing_month);

-- Charges table (merged with payments per spec section 8 simplification)
CREATE TABLE charges (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  billing_month DATE NOT NULL,
  calculated_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_charged NUMERIC(12, 2),
  date_charged DATE,
  payment_method_used payment_method_type,
  status charge_status_type NOT NULL DEFAULT 'pending',
  variance_reason TEXT,
  amount_received NUMERIC(12, 2),
  date_received DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, billing_month)
);

CREATE INDEX idx_charges_client ON charges(client_id);
CREATE INDEX idx_charges_month ON charges(billing_month);
CREATE INDEX idx_charges_status ON charges(status);

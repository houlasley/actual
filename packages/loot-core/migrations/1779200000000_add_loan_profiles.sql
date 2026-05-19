BEGIN TRANSACTION;

CREATE TABLE loan_profiles
  (id TEXT PRIMARY KEY,
   account TEXT UNIQUE,
   original_principal INTEGER DEFAULT 0,
   interest_rate INTEGER DEFAULT 0,
   term_months INTEGER DEFAULT 0,
   origination_date INTEGER,
   payment_amount INTEGER DEFAULT 0,
   escrow_amount INTEGER DEFAULT 0,
   tombstone INTEGER DEFAULT 0);

COMMIT;

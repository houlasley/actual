BEGIN TRANSACTION;

ALTER TABLE accounts ADD COLUMN is_investment INTEGER DEFAULT 0;

CREATE TABLE securities
  (id TEXT PRIMARY KEY,
   ticker TEXT,
   name TEXT,
   type TEXT,
   sort_order REAL,
   tombstone INTEGER DEFAULT 0);

CREATE TABLE holdings
  (id TEXT PRIMARY KEY,
   account TEXT,
   security TEXT,
   shares INTEGER DEFAULT 0,
   cost_basis INTEGER DEFAULT 0,
   tombstone INTEGER DEFAULT 0);

CREATE TABLE security_prices
  (id TEXT PRIMARY KEY,
   security TEXT,
   date INTEGER,
   price INTEGER DEFAULT 0,
   tombstone INTEGER DEFAULT 0);

COMMIT;

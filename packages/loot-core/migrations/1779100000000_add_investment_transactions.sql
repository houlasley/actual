BEGIN TRANSACTION;

CREATE TABLE investment_transactions
  (id TEXT PRIMARY KEY,
   account TEXT,
   security TEXT,
   date INTEGER,
   type TEXT,
   shares INTEGER DEFAULT 0,
   price INTEGER DEFAULT 0,
   sort_order REAL,
   tombstone INTEGER DEFAULT 0);

COMMIT;

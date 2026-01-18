-- V0.3 Company Profile columns on game.companies

ALTER TABLE game.companies
  ADD COLUMN IF NOT EXISTS display_name varchar(48);

ALTER TABLE game.companies
  ADD COLUMN IF NOT EXISTS description varchar(400);

ALTER TABLE game.companies
  ADD COLUMN IF NOT EXISTS logo_url varchar(300);

ALTER TABLE game.companies
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

ALTER TABLE game.companies
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Keep updated_at in sync (if column exists already, skip)
ALTER TABLE game.companies
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Optional: small index for public browsing later
CREATE INDEX IF NOT EXISTS idx_companies_is_public ON game.companies (is_public);

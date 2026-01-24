-- V0.8 Add wallet to users table
-- Adds personal wallet for each player

ALTER TABLE game.users
ADD COLUMN IF NOT EXISTS wallet NUMERIC(14, 2) DEFAULT 0 NOT NULL;

COMMENT ON COLUMN game.users.wallet IS 'Personal wallet balance';

-- Give starting money to existing users
UPDATE game.users SET wallet = 10000 WHERE wallet = 0;

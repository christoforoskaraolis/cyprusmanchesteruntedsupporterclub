ALTER TABLE membership_applications
  ADD COLUMN IF NOT EXISTS family_relationship TEXT,
  ADD COLUMN IF NOT EXISTS family_relationship_other TEXT;

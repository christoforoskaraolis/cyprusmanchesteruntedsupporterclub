-- Family members share the account holder's login; applications link to the sponsor's application.
ALTER TABLE membership_applications
  ADD COLUMN IF NOT EXISTS sponsor_application_id TEXT
    REFERENCES membership_applications (application_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS membership_applications_sponsor_idx
  ON membership_applications (sponsor_application_id)
  WHERE sponsor_application_id IS NOT NULL;

-- Tie official MU requests to a specific membership application (e.g. family member).
ALTER TABLE official_membership_requests
  ADD COLUMN IF NOT EXISTS membership_application_id TEXT
    REFERENCES membership_applications (application_id) ON DELETE SET NULL;

-- User-reported status for official Manchester United membership (activated vs pending).
ALTER TABLE membership_applications
  ADD COLUMN IF NOT EXISTS official_mu_membership_status TEXT
    CHECK (official_mu_membership_status IS NULL OR official_mu_membership_status IN ('activated', 'pending'));

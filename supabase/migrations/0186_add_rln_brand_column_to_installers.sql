-- =============================================================================
-- Add RLN as a new Brand flag on installers, matching the existing
-- Hunter Douglas / Alta / Carole / Architectural / Levolor / Three Day Blinds
-- brand columns: a nullable integer 0/1 flag, read as Yes/No in the UI.
-- =============================================================================

ALTER TABLE public.installers
  ADD COLUMN IF NOT EXISTS rln integer;

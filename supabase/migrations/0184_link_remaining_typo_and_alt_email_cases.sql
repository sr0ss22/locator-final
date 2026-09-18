-- =============================================================================
-- 0184: Link the remaining locator installers whose contact email diverges
-- from Brite (typos in one system, different staff contact, etc.)
--
-- After 0181 (vendor-id), 0182 (manual map), and 0183 (bulk email backfill)
-- there were 16 unlinked installers. The locator owner reviewed each on
-- 2026-05-26 and confirmed the 9 mappings below. The remaining 7 are either
-- "REMOVED" (deactivated/test/internal) or have no Brite counterpart.
--
-- Match key is contact email; we only update rows whose brite_company_id is
-- currently NULL so prior migrations are never overwritten.
-- =============================================================================

DROP TABLE IF EXISTS _brite_alt_email_link_staging;
CREATE TEMP TABLE _brite_alt_email_link_staging (
  locator_email     text PRIMARY KEY,
  locator_label     text NOT NULL,
  brite_company_id  uuid NOT NULL,
  reason            text NOT NULL
);

INSERT INTO _brite_alt_email_link_staging
  (locator_email, locator_label, brite_company_id, reason) VALUES
  ('hjb3000@gmail.co',                'Henry Brown',
     'cd6c9c1c-42ce-4d8f-8747-56766006e400',
     'Locator email has typo - missing "m"; Brite has hjb3000@gmail.com'),
  ('build63@twc.com',                 'Paul Peterson',
     'c29ade6f-10d7-487e-808a-184642c624b4',
     'Same person, different contact email in Brite (ptpeterson63@spectrum.net)'),
  ('cityviewdesign@aol.com',          'Victor Ruiz / City View Designs',
     '489d3db8-523a-4d8e-8abc-7dbca7d7b34a',
     'Locator email missing trailing "s"; Brite has cityviewdesigns@aol.com'),
  ('cyntia@accurateinstallations.com','Walde Nolff / Accurate Installations',
     'ff630674-9293-401b-a28c-c7f7ff37c033',
     'Same company; Brite contact is walde@accurateinstallations.com'),
  ('donald.wells@hotmail.com',        'Don Wells / High Desert Installation',
     '8526fbd9-2f80-43cd-973d-83db7ea80600',
     'Same company; Brite contact is highdesertinstallation@gmail.com'),
  ('windowtreatment@embarqmail.com',  'Andrew Hutchinson - #2',
     '29e0736b-e486-4aa7-b79a-73f886122a07',
     'Locator email missing trailing "s"; siblings #1/#3/#4 already linked here'),
  ('johnstearne@hotmail.com',         'John Stearne / Location #2',
     '2b5100c5-214f-4079-b692-515822345914',
     'Primary "John Stearne" already linked to this Brite UUID'),
  ('roger@theblindguysne.com',        'Roger Allard / The Blind Guys',
     '816b3219-d746-4933-8d7e-82d3610410b4',
     'Same company; Brite contact is allard1212@gmail.com'),
  ('phil50bis@protonmail.com',        'Blinds Installation Services / Philip (Phil) Wall',
     '119953a0-9f60-4b6b-b8dc-f17d2e1c669d',
     'Confirmed by locator owner 2026-05-26: same business, different contact in Brite');

-- Apply the link only when the locator row is still unlinked.
WITH updated AS (
  UPDATE public.installers i
     SET brite_company_id = s.brite_company_id,
         brite_synced_at  = now()
    FROM _brite_alt_email_link_staging s
   WHERE lower(trim(i.email)) = s.locator_email
     AND i.brite_company_id IS NULL
  RETURNING i.id, i.name, s.locator_label, s.brite_company_id
)
SELECT count(*) AS rows_linked_by_alt_email_map FROM updated;

-- Diagnostic: any staged email that didn't apply (DB email differs, or row already linked).
SELECT s.locator_email,
       s.locator_label,
       s.brite_company_id      AS expected_uuid,
       i.brite_company_id      AS actual_uuid_in_db,
       i.name                  AS locator_name
  FROM _brite_alt_email_link_staging s
  LEFT JOIN public.installers i ON lower(trim(i.email)) = s.locator_email
 WHERE i.id IS NULL OR i.brite_company_id IS DISTINCT FROM s.brite_company_id
 ORDER BY s.locator_label;

-- Final reconciliation snapshot.
SELECT
  (SELECT count(*) FROM public.installers)                                  AS total_locator,
  (SELECT count(*) FROM public.installers WHERE brite_company_id IS NOT NULL) AS linked_to_brite,
  (SELECT count(*) FROM public.installers WHERE brite_company_id IS NULL)     AS still_unlinked,
  round(100.0 * (SELECT count(*) FROM public.installers WHERE brite_company_id IS NOT NULL)
              / (SELECT count(*) FROM public.installers), 1) AS pct_linked;

DROP TABLE IF EXISTS _brite_alt_email_link_staging;

-- =============================================================================
-- INFORMATIONAL: After this migration the following locator records remain
-- unlinked by design. They are either deactivated, internal/test accounts,
-- or genuinely have no Brite counterpart. Confirmed by locator owner 2026-05-26.
--
--   * Fundrail Quimbley / LuxView           - REMOVED
--   * Gregory Thompson                      - not in Brite
--   * James De La Garza (@hunterdouglas.com)- HD employee/test; he has his own
--                                             installer record under Brite UUID
--                                             1cd50fb1-bd7e-410d-843f-b727496c8be3
--   * Mikaela (FSM Test)                    - REMOVED
--   * Richard Viscusi                       - REMOVED (already is_active = 0)
--   * CPI Installations / Marco Pallucci    - REMOVED
--   * William Ayala / Ocean Window Decor    - REMOVED
-- =============================================================================

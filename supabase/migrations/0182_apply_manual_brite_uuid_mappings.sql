-- =============================================================================
-- Manual Brite UUID mappings for locator records that didn't backfill via
-- vendor_number in 0181. These were reviewed and confirmed against Brite by
-- the locator owner on 2026-05-26. Mismatches happened because Brite stores
-- the company name (e.g. 'TKR Design Llc') while the locator uses the contact
-- person ('Trent Halford'), and contact emails frequently differ between
-- systems.
--
-- Match key is contact email (locator.email == staging.locator_email).
-- Multi-location locator rows that share an email all link to the SAME
-- Brite company - that is the rule from the locator owner.
-- =============================================================================

DROP TABLE IF EXISTS _brite_manual_link_staging;
CREATE TEMP TABLE _brite_manual_link_staging (
  locator_email     text PRIMARY KEY,
  locator_label     text NOT NULL,
  brite_company_id  uuid NOT NULL
);

INSERT INTO _brite_manual_link_staging (locator_email, locator_label, brite_company_id) VALUES
  ('treheff@comcast.net', 'Trent Halford', 'd321ec4d-7ed7-41ae-a5c9-655917a45e2d'),
  ('cjames.installations@gmail.com', 'Colin Woolard', '28d81b1a-b42a-4c1b-bbc1-4a1bbffc5883'),
  ('rbh235@aol.com', 'Robert Herman', '7be359e3-7dac-48da-9b59-918f534a67c3'),
  ('jedisioninteriors@gmail.com', 'Joe Gebara', '78dd85d3-c8d1-48d7-87c7-bf27a7302d5c'),
  ('wassimmokbel@gmail.com', 'Wassim Mokbel', '622fbd25-d83d-46cd-9a06-15397c410be8'),
  ('jobs.ftds@gmail.com', 'FT Decor', '28a650cf-24fc-4643-9513-4e1d86ab7902'),
  ('rockfordinteriors@att.net', 'Mark Waite', 'ab601f33-a643-46b4-9da4-2b17cc70c356'),
  ('nick@homeinnovations.com', 'Nick Mitchell', 'b35d2dfb-57e6-4206-9d6f-aa1b8511ede2'),
  ('stwindowcoverings@sbcglobal.net', 'Steve Tafoya', 'abc2fbed-137c-4be2-b34f-1e1a40110d8e'),
  ('caroldrake@bellsouth.net', 'Jeff Drake', '03c2b6fe-5fef-49fc-ad2c-5281633d97bd'),
  ('blindman4223@gmail.com', 'Damon Lapp', '789417f4-18fd-4ef8-ab9f-410bb297e47e'),
  ('info@windowtrendsnj.com', 'Mike Iannone', 'd7f4c3ad-7638-4228-8bcf-8f7ada6b4f5a'),
  ('mark@rbpros.com', 'Mark Cieniewicz', '62e00305-9961-4aa1-9873-41a25a0cb7dc'),
  ('derek.kullman@gmail.com', 'Derek Kullman', 'f766c88f-dbc0-4176-ac12-4ac17aa22c50'),
  ('schedule-bookings@shadomatic.ca', 'Installation Experts Group', 'd8d0ff95-e20e-4b24-805c-6ab5fdedf2fa'),
  ('schedule-bookings@shadeomatic.ca', 'Installations Experts Group', 'd8d0ff95-e20e-4b24-805c-6ab5fdedf2fa'),
  ('installs@designerservicesandinstallations.com', 'William (Butch) Jenkins', '576f64f7-d6a6-4d9b-868f-578eabeafebe'),
  ('nelsonsprowindowtreatments@gmail.com', 'Nick Nelson', '27ff3e90-7726-4d67-bc2b-5327314a9c9f'),
  ('pmsaker@sbcglobal.net', 'Matthew Saker', 'fa2948e1-df39-4a29-8a3f-2ed66f935df3'),
  ('integritywindowtreatments@gmail.com', 'Mark "Cory" Brennan', '3767ad08-f9a4-4088-890c-dbe0fd4c4973'),
  ('ocorkn@cox.net', 'Orin Corkern', '955bcac0-ae92-41f5-a519-fee2520d3b6d'),
  ('jdgarbrecht@charter.net', 'Jeff Garbrecht', '83aeb8a0-eade-499a-9a88-5113a9b582a1'),
  ('mallorysmeasureinstall@gmail.com', 'Barry Mallory', '0ba4a980-2e21-4519-b168-9b7268b65980'),
  ('raysblindsjob@gmail.com', 'Raynard Butler', 'f00fc04e-af4a-48f1-8e1f-8eb3dac74bbf'),
  ('srcline65@comcast.net', 'Steven Cline', '8352bf45-0ca7-4ed9-bb85-3eac2a29d735'),
  ('tim@yoreunlimited.com', 'Timothy McKay', 'd9c3abd9-6ddc-481f-afa7-d10ce070334c'),
  ('precisionblind@att.net', 'Paul Boehmig', '7630ab01-7c05-4537-b1ad-ef7d41e701a2'),
  ('anton@hilandesign.com', 'Anton Neureiter', '5528cceb-c054-40b6-8b68-40f7c2904103'),
  ('dustin.wooldridge@hunterdouglas.com', 'Dustin Wooldridge', '5046a750-05a3-43d8-bfdf-22d7c5eea94d'),
  ('bluemooninstallations@gmail.com', 'Dana McDonough', '38919ef6-dedc-49ef-87fe-0d23943f9c3e'),
  ('jeremy@kleinsinstallation.com', 'Jeremy Klein', 'b709807f-c50a-4827-8d33-6c8b44407e20'),
  ('cww.ilmaughanenterprisellc@gmail.com', 'Ian Maughan', '46283be5-b192-4006-bd4f-309235482e34'),
  ('triplehhh016@aol.com', 'Chris Seelig', 'f0f3b84d-3eec-4b47-92b8-3ad4509d3825'),
  ('lemuriancustom@gmail.com', 'John Alexander', '59898833-c20a-47a9-a1f1-268e145cc998'),
  ('bill@decsignco.com', 'William (Bill) Snyder', '0829902c-0be6-49b2-97f7-1a3f76c5228f'),
  ('designbyrichie@gmail.com', 'Richie Quilumba', 'ead1133f-0f25-4c13-9416-925f85364ce2'),
  ('mangualh@hotmail.com', 'Hector Mangual', '1ca5f0de-a6d9-4ba0-9700-2e663a675248'),
  ('ian_spencer@sympatico.ca', 'Ian Spencer', '1d6bd6e9-5e2d-4f4a-89d2-c2e7f06d06ac'),
  ('tricityblindguy@gmail.com', 'Trevor Wheeler', '3404ccee-60b2-42e3-bf9c-8345a11a65e6'),
  ('soniclean1@gmail.com', 'Douglas Lester', 'cc9bcdd8-fee0-45bf-94f7-4c9e855f9f72'),
  ('authenticshades@hotmail.com', 'Endri Skenderi', '0aad2b08-9f20-470d-b7a1-32cdaff6384f'),
  ('tomasc573@aol.com', 'Thomas Cortijo', '58966a72-5293-4b10-b3e8-c5dacf83f0d5'),
  ('mark@stanges.com', 'Mark Stange', 'b7c386db-5807-461d-a673-1433231edf87'),
  ('mike.installs@bell.net', 'Mike Baker', '4ea63439-6db8-433a-bb5e-2c0075c55280'),
  ('superior@mailmt.com', 'Mike Beaumont', '25bada38-0e79-44cc-8d98-ff6629c87ae3'),
  ('info@instal.ca', 'Yann Michel', 'e5f6a5f3-61da-454c-b8f4-c56bedb71828'),
  ('wsinstall@aol.com', 'Robert Opfermann', 'ca59382a-9e85-4705-a9c9-0f5526af8d4c'),
  ('walt@ctservicesfw.com', 'Walt Smith', '596125ae-485b-46bf-a414-99620a056975');

-- 1. Apply the link by email match.
WITH updated AS (
  UPDATE public.installers i
     SET brite_company_id = s.brite_company_id,
         brite_synced_at  = now()
    FROM _brite_manual_link_staging s
   WHERE lower(trim(i.email)) = s.locator_email
     AND (i.brite_company_id IS NULL OR i.brite_company_id <> s.brite_company_id)
  RETURNING i.id, i.name, s.locator_label, s.brite_company_id
)
SELECT count(*) AS rows_linked_by_manual_map FROM updated;

-- 2. Reconciliation: how many staged emails actually matched a locator row?
SELECT
  (SELECT count(*) FROM _brite_manual_link_staging) AS staged_mappings,
  (SELECT count(DISTINCT s.locator_email)
     FROM _brite_manual_link_staging s
     JOIN public.installers i ON lower(trim(i.email)) = s.locator_email)
    AS staged_mappings_with_locator_match,
  (SELECT count(*) FROM public.installers
    WHERE brite_company_id IS NOT NULL) AS total_locator_linked_to_brite,
  (SELECT count(*) FROM public.installers
    WHERE brite_company_id IS NULL)     AS total_locator_unlinked;

-- 3. Unmatched staged emails (so we can see if any didn't apply).
SELECT s.locator_email, s.locator_label, s.brite_company_id
  FROM _brite_manual_link_staging s
  LEFT JOIN public.installers i ON lower(trim(i.email)) = s.locator_email
 WHERE i.id IS NULL
 ORDER BY s.locator_label;

DROP TABLE IF EXISTS _brite_manual_link_staging;

-- =============================================================================
-- 4. Propagate brite_company_id to "Location #2/3/4" duplicates.
--
-- Rule from the locator owner: secondary location records should always link
-- to the same Brite company as the primary location. We approximate "primary"
-- as: any sibling row sharing a (lower-trimmed) email that already has a
-- brite_company_id set. If multiple siblings disagree we leave the row alone
-- so it can be inspected manually instead of guessing wrong.
-- =============================================================================
WITH email_uuid_consensus AS (
  -- Postgres has no min()/max() aggregate for uuid, so we use array_agg
  -- DISTINCT and pick the lone element when there is exactly one.
  SELECT lower(trim(email)) AS email_key,
         array_agg(DISTINCT brite_company_id) AS uuids
    FROM public.installers
   WHERE email IS NOT NULL
     AND brite_company_id IS NOT NULL
   GROUP BY lower(trim(email))
), unambiguous AS (
  SELECT email_key, uuids[1] AS brite_company_id
    FROM email_uuid_consensus
   WHERE array_length(uuids, 1) = 1
), propagated AS (
  UPDATE public.installers i
     SET brite_company_id = u.brite_company_id,
         brite_synced_at  = now()
    FROM unambiguous u
   WHERE lower(trim(i.email)) = u.email_key
     AND i.brite_company_id IS NULL
  RETURNING i.id, i.name, u.brite_company_id
)
SELECT count(*) AS extra_locations_linked_by_email_propagation FROM propagated;

-- =============================================================================
-- INFORMATIONAL: the following locator records were marked 'REMOVED' by the
-- locator owner. They are NOT linked to a Brite UUID by this migration.
-- Review and either deactivate or delete in a follow-up:
--   * Richard Viscusi
--   * Joseph Zumwalt
--   * Fundrail Quimbley
--   * Mikaela
-- =============================================================================

-- =============================================================================
-- INFORMATIONAL: the following locator records had no Brite UUID provided yet
-- and remain unlinked after this migration:
--   * Gregory Thompson <windowdoctor62@gmail.com>
--   * William Ayala / Ocean Window Decor <oceanwindowdecor@gmail.com>
-- =============================================================================

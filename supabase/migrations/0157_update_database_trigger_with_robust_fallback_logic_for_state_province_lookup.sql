CREATE OR REPLACE FUNCTION public.set_territory_state_on_insert_or_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    _state_province TEXT := NULL;
BEGIN
    -- Run the logic only if the state_province is effectively blank or explicitly 'Unknown'.
    IF trim(COALESCE(NEW.state_province, '')) = '' OR NEW.state_province = 'Unknown' THEN

        -- 1. For Canadian codes, check the detailed postal code table first.
        IF NEW.zip_code ~ '^[A-Z]' THEN
            SELECT "PROVINCE_ABBR" INTO _state_province
            FROM public.canadian_postal_codes
            WHERE "POSTAL_CODE" = NEW.zip_code
            LIMIT 1;
        END IF;

        -- 2. If not found, check the main geometries table for all codes.
        IF _state_province IS NULL THEN
            SELECT state_province INTO _state_province
            FROM public.zip_code_geometries
            WHERE zip_code = NEW.zip_code
            LIMIT 1;
        END IF;

        -- If the result from the tables is still invalid, nullify it so we can try the fallback.
        IF _state_province = 'Unknown' OR trim(COALESCE(_state_province, '')) = '' THEN
            _state_province := NULL;
        END IF;

        -- 3. If still not found, use the fallback for US ZIP codes.
        IF _state_province IS NULL AND NEW.zip_code ~ '^[0-9]{5}$' THEN
            SELECT
                CASE
                    -- Northeast
                    WHEN left(NEW.zip_code, 3) BETWEEN '010' AND '027' OR left(NEW.zip_code, 3) = '055' THEN 'MA'
                    WHEN left(NEW.zip_code, 3) BETWEEN '060' AND '069' THEN 'CT'
                    WHEN left(NEW.zip_code, 3) BETWEEN '028' AND '029' THEN 'RI'
                    WHEN left(NEW.zip_code, 3) BETWEEN '030' AND '038' THEN 'NH'
                    WHEN left(NEW.zip_code, 3) BETWEEN '039' AND '049' THEN 'ME'
                    WHEN left(NEW.zip_code, 3) BETWEEN '050' AND '059' THEN 'VT'
                    WHEN left(NEW.zip_code, 3) = '005' OR left(NEW.zip_code, 3) = '063' OR left(NEW.zip_code, 3) BETWEEN '100' AND '149' THEN 'NY'
                    WHEN left(NEW.zip_code, 3) BETWEEN '070' AND '089' THEN 'NJ'
                    WHEN left(NEW.zip_code, 3) BETWEEN '150' AND '196' THEN 'PA'
                    -- Midwest
                    WHEN left(NEW.zip_code, 3) BETWEEN '430' AND '459' THEN 'OH'
                    WHEN left(NEW.zip_code, 3) BETWEEN '460' AND '479' THEN 'IN'
                    WHEN left(NEW.zip_code, 3) BETWEEN '480' AND '499' THEN 'MI'
                    WHEN left(NEW.zip_code, 3) BETWEEN '530' AND '549' THEN 'WI'
                    WHEN left(NEW.zip_code, 3) BETWEEN '600' AND '629' THEN 'IL'
                    WHEN left(NEW.zip_code, 3) BETWEEN '550' AND '567' THEN 'MN'
                    WHEN left(NEW.zip_code, 3) BETWEEN '500' AND '528' THEN 'IA'
                    WHEN left(NEW.zip_code, 3) BETWEEN '630' AND '658' THEN 'MO'
                    -- South
                    WHEN left(NEW.zip_code, 3) BETWEEN '197' AND '199' THEN 'DE'
                    WHEN left(NEW.zip_code, 3) BETWEEN '206' AND '219' THEN 'MD'
                    WHEN left(NEW.zip_code, 3) BETWEEN '201' AND '246' THEN 'VA'
                    WHEN left(NEW.zip_code, 3) BETWEEN '200' AND '205' THEN 'DC'
                    WHEN left(NEW.zip_code, 3) BETWEEN '247' AND '268' THEN 'WV'
                    WHEN left(NEW.zip_code, 3) BETWEEN '270' AND '289' THEN 'NC'
                    WHEN left(NEW.zip_code, 3) BETWEEN '290' AND '299' THEN 'SC'
                    WHEN left(NEW.zip_code, 3) BETWEEN '300' AND '319' OR left(NEW.zip_code, 3) BETWEEN '398' AND '399' THEN 'GA'
                    WHEN left(NEW.zip_code, 3) BETWEEN '320' AND '349' THEN 'FL'
                    WHEN left(NEW.zip_code, 3) BETWEEN '400' AND '427' THEN 'KY'
                    WHEN left(NEW.zip_code, 3) BETWEEN '370' AND '385' THEN 'TN'
                    WHEN left(NEW.zip_code, 3) BETWEEN '350' AND '369' THEN 'AL'
                    WHEN left(NEW.zip_code, 3) BETWEEN '386' AND '397' THEN 'MS'
                    -- Southwest
                    WHEN left(NEW.zip_code, 3) BETWEEN '716' AND '729' THEN 'AR'
                    WHEN left(NEW.zip_code, 3) BETWEEN '700' AND '715' THEN 'LA'
                    WHEN left(NEW.zip_code, 3) BETWEEN '750' AND '799' OR left(NEW.zip_code, 3) = '885' THEN 'TX'
                    -- West
                    WHEN left(NEW.zip_code, 3) BETWEEN '730' AND '749' THEN 'OK'
                    WHEN left(NEW.zip_code, 3) BETWEEN '660' AND '679' THEN 'KS'
                    WHEN left(NEW.zip_code, 3) BETWEEN '680' AND '693' THEN 'NE'
                    WHEN left(NEW.zip_code, 3) BETWEEN '570' AND '579' THEN 'SD'
                    WHEN left(NEW.zip_code, 3) BETWEEN '580' AND '588' THEN 'ND'
                    WHEN left(NEW.zip_code, 3) BETWEEN '870' AND '884' THEN 'NM'
                    WHEN left(NEW.zip_code, 3) BETWEEN '800' AND '816' THEN 'CO'
                    WHEN left(NEW.zip_code, 3) BETWEEN '820' AND '831' THEN 'WY'
                    WHEN left(NEW.zip_code, 3) BETWEEN '590' AND '599' THEN 'MT'
                    WHEN left(NEW.zip_code, 3) BETWEEN '832' AND '838' THEN 'ID'
                    WHEN left(NEW.zip_code, 3) BETWEEN '840' AND '847' THEN 'UT'
                    WHEN left(NEW.zip_code, 3) BETWEEN '850' AND '865' THEN 'AZ'
                    WHEN left(NEW.zip_code, 3) BETWEEN '889' AND '898' THEN 'NV'
                    WHEN left(NEW.zip_code, 3) BETWEEN '900' AND '961' THEN 'CA'
                    -- Pacific & Non-Contiguous
                    WHEN left(NEW.zip_code, 3) BETWEEN '970' AND '979' THEN 'OR'
                    WHEN left(NEW.zip_code, 3) BETWEEN '980' AND '994' THEN 'WA'
                    WHEN left(NEW.zip_code, 3) BETWEEN '995' AND '999' THEN 'AK'
                    WHEN left(NEW.zip_code, 3) BETWEEN '967' AND '968' THEN 'HI'
                    ELSE NULL
                END
            INTO _state_province;
        END IF;

        -- If we found a valid state/province from any method, update the row.
        IF _state_province IS NOT NULL AND trim(_state_province) <> '' AND _state_province <> 'Unknown' THEN
            NEW.state_province := _state_province;
        END IF;

    END IF;

    RETURN NEW;
END;
$function$;
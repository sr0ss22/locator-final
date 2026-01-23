CREATE OR REPLACE FUNCTION public.update_zip_code_states()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    updated_count integer;
BEGIN
    WITH updates AS (
        UPDATE public.installer_zip_codes
        SET state_province =
            CASE
                -- Northeast
                WHEN left(zip_code, 3) BETWEEN '010' AND '027' OR left(zip_code, 3) = '055' THEN 'MA'
                WHEN left(zip_code, 3) BETWEEN '060' AND '069' THEN 'CT'
                WHEN left(zip_code, 3) BETWEEN '028' AND '029' THEN 'RI'
                WHEN left(zip_code, 3) BETWEEN '030' AND '038' THEN 'NH'
                WHEN left(zip_code, 3) BETWEEN '039' AND '049' THEN 'ME'
                WHEN left(zip_code, 3) BETWEEN '050' AND '059' THEN 'VT'
                WHEN left(zip_code, 3) = '005' OR left(zip_code, 3) = '063' OR left(zip_code, 3) BETWEEN '100' AND '149' THEN 'NY'
                WHEN left(zip_code, 3) BETWEEN '070' AND '089' THEN 'NJ'
                WHEN left(zip_code, 3) BETWEEN '150' AND '196' THEN 'PA'
                -- Midwest
                WHEN left(zip_code, 3) BETWEEN '430' AND '459' THEN 'OH'
                WHEN left(zip_code, 3) BETWEEN '460' AND '479' THEN 'IN'
                WHEN left(zip_code, 3) BETWEEN '480' AND '499' THEN 'MI'
                WHEN left(zip_code, 3) BETWEEN '530' AND '549' THEN 'WI'
                WHEN left(zip_code, 3) BETWEEN '600' AND '629' THEN 'IL'
                WHEN left(zip_code, 3) BETWEEN '550' AND '567' THEN 'MN'
                WHEN left(zip_code, 3) BETWEEN '500' AND '528' THEN 'IA'
                WHEN left(zip_code, 3) BETWEEN '630' AND '658' THEN 'MO'
                -- South
                WHEN left(zip_code, 3) BETWEEN '197' AND '199' THEN 'DE'
                WHEN left(zip_code, 3) BETWEEN '206' AND '219' THEN 'MD'
                WHEN left(zip_code, 3) BETWEEN '201' AND '246' THEN 'VA'
                WHEN left(zip_code, 3) BETWEEN '200' AND '205' THEN 'DC'
                WHEN left(zip_code, 3) BETWEEN '247' AND '268' THEN 'WV'
                WHEN left(zip_code, 3) BETWEEN '270' AND '289' THEN 'NC'
                WHEN left(zip_code, 3) BETWEEN '290' AND '299' THEN 'SC'
                WHEN left(zip_code, 3) BETWEEN '300' AND '319' OR left(zip_code, 3) BETWEEN '398' AND '399' THEN 'GA'
                WHEN left(zip_code, 3) BETWEEN '320' AND '349' THEN 'FL'
                WHEN left(zip_code, 3) BETWEEN '400' AND '427' THEN 'KY'
                WHEN left(zip_code, 3) BETWEEN '370' AND '385' THEN 'TN'
                WHEN left(zip_code, 3) BETWEEN '350' AND '369' THEN 'AL'
                WHEN left(zip_code, 3) BETWEEN '386' AND '397' THEN 'MS'
                -- Southwest
                WHEN left(zip_code, 3) BETWEEN '716' AND '729' THEN 'AR'
                WHEN left(zip_code, 3) BETWEEN '700' AND '715' THEN 'LA'
                WHEN left(zip_code, 3) BETWEEN '750' AND '799' OR left(zip_code, 3) = '885' THEN 'Texas'
                -- West
                WHEN left(zip_code, 3) BETWEEN '730' AND '749' THEN 'OK'
                WHEN left(zip_code, 3) BETWEEN '660' AND '679' THEN 'KS'
                WHEN left(zip_code, 3) BETWEEN '680' AND '693' THEN 'NE'
                WHEN left(zip_code, 3) BETWEEN '570' AND '579' THEN 'SD'
                WHEN left(zip_code, 3) BETWEEN '580' AND '588' THEN 'ND'
                WHEN left(zip_code, 3) BETWEEN '870' AND '884' THEN 'NM'
                WHEN left(zip_code, 3) BETWEEN '800' AND '816' THEN 'CO'
                WHEN left(zip_code, 3) BETWEEN '820' AND '831' THEN 'WY'
                WHEN left(zip_code, 3) BETWEEN '590' AND '599' THEN 'MT'
                WHEN left(zip_code, 3) BETWEEN '832' AND '838' THEN 'ID'
                WHEN left(zip_code, 3) BETWEEN '840' AND '847' THEN 'UT'
                WHEN left(zip_code, 3) BETWEEN '850' AND '865' THEN 'AZ'
                WHEN left(zip_code, 3) BETWEEN '889' AND '898' THEN 'NV'
                WHEN left(zip_code, 3) BETWEEN '900' AND '961' THEN 'CA'
                -- Pacific & Non-Contiguous
                WHEN left(zip_code, 3) BETWEEN '970' AND '979' THEN 'OR'
                WHEN left(zip_code, 3) BETWEEN '980' AND '994' THEN 'WA'
                WHEN left(zip_code, 3) BETWEEN '995' AND '999' THEN 'AK'
                WHEN left(zip_code, 3) BETWEEN '967' AND '968' THEN 'HI'
                ELSE state_province -- Keep the existing value if no match
            END
        WHERE
            zip_code ~ '^[0-9]{5}$' -- Only apply to 5-digit US ZIP codes
        RETURNING id
    )
    SELECT count(*) INTO updated_count FROM updates;

    RETURN 'Updated ' || updated_count || ' territory records with correct state abbreviations.';
END;
$function$
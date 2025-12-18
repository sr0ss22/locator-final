CREATE OR REPLACE FUNCTION public.truncate_canadian_postal_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  -- Check if the user has the 'admin' role from the profiles table
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) != 'admin' THEN
    RAISE EXCEPTION 'Permission denied: Only admins can perform this action.';
  END IF;
  
  -- If the check passes, truncate the table
  TRUNCATE TABLE public.canadian_postal_codes;
END;
$$;
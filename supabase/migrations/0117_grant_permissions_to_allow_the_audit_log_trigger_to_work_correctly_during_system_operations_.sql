-- Allow the 'postgres' role (used by SECURITY DEFINER functions) to access the auth schema
GRANT USAGE ON SCHEMA auth TO postgres;

-- Allow the 'postgres' role to execute the uid() function
GRANT EXECUTE ON FUNCTION auth.uid() TO postgres;
-- Create a new policy that allows users with the 'admin' role to perform all actions on the table.
CREATE POLICY "Admins can manage canadian postal codes"
ON public.canadian_postal_codes
FOR ALL
TO authenticated
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::app_role)
WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::app_role);
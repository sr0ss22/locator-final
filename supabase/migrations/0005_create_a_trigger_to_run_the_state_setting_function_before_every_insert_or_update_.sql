CREATE TRIGGER trigger_set_territory_state
BEFORE INSERT OR UPDATE ON public.installer_zip_codes
FOR EACH ROW
EXECUTE FUNCTION public.set_territory_state_on_insert_or_update();
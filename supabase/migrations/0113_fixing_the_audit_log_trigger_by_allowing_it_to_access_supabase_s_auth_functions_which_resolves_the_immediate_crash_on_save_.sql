CREATE OR REPLACE FUNCTION public.log_installer_zip_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  _change_type TEXT;
  _summary TEXT;
  _previous_field_ops_rep_id UUID := NULL;
  _new_field_ops_rep_id UUID := NULL;
  _previous_field_service_manager_id UUID := NULL;
  _new_field_service_manager_id UUID := NULL;
  _previous_status TEXT := NULL;
  _new_status TEXT := NULL;
  _target_id UUID;
  _target_zip_code TEXT;
  _target_installer_id TEXT;
  _user_id UUID;
BEGIN
  -- Safely get the user ID. It will be NULL if no user is authenticated (e.g., server-side calls).
  SELECT auth.uid() INTO _user_id;

  IF TG_OP = 'INSERT' THEN
    _change_type := 'assignment_created';
    _summary := 'New ZIP code assignment created for installer ' || NEW.installer_id || '.';
    _new_field_ops_rep_id := NEW.field_ops_rep_id;
    _new_field_service_manager_id := NEW.field_service_manager_id;
    _new_status := NEW.status;
    _target_id := NEW.id;
    _target_zip_code := NEW.zip_code;
    _target_installer_id := NEW.installer_id;
  ELSIF TG_OP = 'UPDATE' THEN
    _change_type := 'assignment_updated';
    _summary := 'ZIP code assignment updated for installer ' || NEW.installer_id || '.';

    IF OLD.field_ops_rep_id IS DISTINCT FROM NEW.field_ops_rep_id THEN
      _previous_field_ops_rep_id := OLD.field_ops_rep_id;
      _new_field_ops_rep_id := NEW.field_ops_rep_id;
      _summary := _summary || ' Field Ops Rep changed.';
    END IF;

    IF OLD.field_service_manager_id IS DISTINCT FROM NEW.field_service_manager_id THEN
      _previous_field_service_manager_id := OLD.field_service_manager_id;
      _new_field_service_manager_id := NEW.field_service_manager_id;
      _summary := _summary || ' Field Service Manager changed.';
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _previous_status := OLD.status;
      _new_status := NEW.status;
      _summary := _summary || ' Status changed from ' || OLD.status || ' to ' || NEW.status || '.';
    END IF;

    IF _previous_field_ops_rep_id IS NULL AND _new_field_ops_rep_id IS NULL AND
       _previous_field_service_manager_id IS NULL AND _new_field_service_manager_id IS NULL AND
       _previous_status IS NULL AND _new_status IS NULL THEN
      RETURN NEW;
    END IF;
    _target_id := NEW.id;
    _target_zip_code := NEW.zip_code;
    _target_installer_id := NEW.installer_id;
  ELSIF TG_OP = 'DELETE' THEN
    _change_type := 'assignment_deleted';
    _summary := 'ZIP code assignment deleted for installer ' || OLD.installer_id || '.';
    _previous_field_ops_rep_id := OLD.field_ops_rep_id;
    _previous_field_service_manager_id := OLD.field_service_manager_id;
    _previous_status := OLD.status;
    _new_field_ops_rep_id := NULL;
    _new_field_service_manager_id := NULL;
    _new_status := NULL;
    _target_id := NULL;
    _target_zip_code := OLD.zip_code;
    _target_installer_id := OLD.installer_id;
  END IF;

  INSERT INTO public.territory_audit_log (
    installer_zip_code_assignment_id,
    zip_code,
    installer_id,
    change_type,
    assigned_by,
    previous_field_ops_rep_id,
    new_field_ops_rep_id,
    previous_field_service_manager_id,
    new_field_service_manager_id,
    previous_status,
    new_status,
    summary
  ) VALUES (
    _target_id,
    _target_zip_code,
    _target_installer_id,
    _change_type,
    _user_id,
    _previous_field_ops_rep_id,
    _new_field_ops_rep_id,
    _previous_field_service_manager_id,
    _new_field_service_manager_id,
    _previous_status,
    _new_status,
    _summary
  );
  
  IF (TG_OP = 'DELETE') THEN
      RETURN OLD;
  ELSE
      RETURN NEW;
  END IF;
END;
$function$
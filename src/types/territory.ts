export type TerritoryStatus = "Approved" | "Needs Approval";

export interface UserProfile {
  id: string; // UUID from auth.users
  first_name: string | null;
  last_name: string | null;
  role: string; // e.g., 'admin', 'field_ops_rep', 'field_service_manager', 'user'
}

// This interface now represents an installer's assignment to a ZIP code,
// including the status and assigned reps specific to that assignment.
export interface InstallerZipAssignment {
  id: string; // Primary key of installer_zip_codes
  installer_id: string; // Foreign key to installers.id
  zip_code: string;
  state_province: string; // Now part of the assignment
  field_ops_rep_id: string | null; // UUID
  field_service_manager_id: string | null; // UUID
  status: TerritoryStatus; // Status specific to this assignment
  created_at: string;
  updated_at: string;
  // Joined data for display
  field_ops_rep?: UserProfile | null;
  field_service_manager?: UserProfile | null;
  installer_name?: string; // For display in global management
}

export interface TerritoryAuditLog {
  id: string;
  zip_code: string;
  change_type: string;
  assigned_by: string;
  assigned_at: string;
  previous_field_ops_rep_id: string | null;
  new_field_ops_rep_id: string | null;
  previous_field_service_manager_id: string | null;
  new_field_service_manager_id: string | null;
  summary: string | null;
  // Joined data for display
  assigned_by_profile?: UserProfile | null;
  previous_field_ops_rep_profile?: UserProfile | null;
  new_field_ops_rep_profile?: UserProfile | null;
  previous_field_service_manager_profile?: UserProfile | null;
  new_field_service_manager_profile?: UserProfile | null;
}
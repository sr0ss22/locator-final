export type InstallerSkill = "Blinds & Shades" | "Shutters" | "Drapery" | "Automation" | "Service Call" | "Tall Window" | "Fixture Displays" | "Outdoor" | "High Voltage Hardwired";
export type InstallerBrand = "Hunter Douglas" | "Alta" | "Carole" | "Architectural" | "Levolor" | "Three Day Blinds";
export type InstallerCertification = "Motorization Pro" | "Certified Installer" | "Master Installer" | "Shutter Pro" | "Drapery Pro" | "PIP Certified";

export interface Installer {
  id: string;
  name: string;
  address: string; // Combined address
  zipCode: string; // Mapped from postalcode
  phone: string; // Mapped from primary_phone
  email?: string; // Added based on user request
  skills: InstallerSkill[]; // Aggregated product skills
  brands: InstallerBrand[]; // Aggregated brands
  certifications: InstallerCertification[]; // Aggregated certifications
  latitude?: number;
  longitude?: number;
  installerVendorId?: string;
  acceptsShipments?: boolean;
  is_local_service_area?: boolean; // New flag for public locator
  // Raw fields for specific column display as requested by user, now in snake_case
  blinds_and_shades_raw?: number;
  pip_certification_level_raw?: string;
  power_view_raw?: string;
  powerview_certification_raw?: string;
  draperies_raw?: number;
  draperies_certification_level_raw?: string;
  shutters_raw?: number;
  shutter_certification_level_raw?: string;
  alta_raw?: number;
  alta_motorization_raw?: number;
  // New raw fields for Brands
  hunter_douglas_raw?: number;
  carole_raw?: number;
  architectural_raw?: number;
  levolor_raw?: number;
  three_day_blinds_raw?: number;
  // New raw fields for Product Skills
  tall_window_raw?: number;
  fixture_displays_raw?: number;
  outdoor_raw?: number;
  high_voltage_hardwired_raw?: number;
  // Keep rawSupabaseData for other fields not explicitly mapped or for full raw access
  rawSupabaseData?: any;
}
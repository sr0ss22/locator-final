export type InstallerSkill = "Blinds & Shades" | "Shutters" | "Drapery" | "Motorization" | "Service Call" | "Tall Window" | "Fixture Displays" | "Outdoor" | "High Voltage Hardwired";
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
  // Raw fields for specific column display as requested by user
  Blinds_and_Shades_Raw?: number; // Corresponds to 'Blinds and Shades'
  PIP_Certification_Level_Raw?: string; // Corresponds to 'PIP Certification'
  PowerView_Raw?: string; // Corresponds to 'PowerView' (from DB)
  Powerview_Certification_Raw?: string; // Corresponds to 'Power View Certification'
  Draperies_Raw?: number; // Corresponds to 'Draperies'
  Draperies_Certification_Level_Raw?: string; // Corresponds to 'Draperies Certification'
  Shutters_Raw?: number; // Corresponds to 'Shutters'
  Shutter_Certification_Level_Raw?: string; // Corresponds to 'Shutter Certification Level'
  Alta_Raw?: number; // Corresponds to 'Alta'
  alta_motorization_Raw?: number; // Corresponds to 'Alta Motorization'
  // New raw fields for Brands
  Hunter_Douglas_Raw?: number;
  Carole_Raw?: number;
  Architectural_Raw?: number;
  Levolor_Raw?: number;
  Three_Day_Blinds_Raw?: number;
  // New raw fields for Product Skills
  Tall_Window_Raw?: number;
  Fixture_Displays_Raw?: number;
  Outdoor_Raw?: number;
  High_Voltage_Hardwired_Raw?: number;
  // Keep rawSupabaseData for other fields not explicitly mapped or for full raw access
  rawSupabaseData?: any;
}
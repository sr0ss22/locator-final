import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { useCountrySettings } from "@/hooks/useCountrySettings"; // Import the hook

interface AddInstallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newInstallerData: any) => Promise<void>;
  loading: boolean;
}

// Helper to convert boolean to Supabase-compatible values
const fromBooleanToSupabase = (key: string, value: boolean): string | number => {
  if (['PowerView'].includes(key)) { // Only PowerView needs '1'/'0' string
    return value ? '1' : '0';
  }
  if (['Shipment'].includes(key)) { // Shipment needs 'Yes'/'No' string
    return value ? 'Yes' : 'No';
  }
  return value ? 1 : 0; // Other boolean-like fields use 1/0
};

// Define field groups for better organization
const contactAddressFields = [
  "name", "email",
  "primary_phone", "secondary_phone",
  "address1", "add2",
  "city", "state",
  "postalcode", "Country"
];

// New structure for Brands (Level 1)
const brandCheckboxes = [
  { key: "Hunter_Douglas", label: "Hunter Douglas" },
  { key: "Alta", label: "Alta" },
  { key: "Carole", label: "Carole" },
  { key: "Architectural", label: "Architectural" },
  { key: "Levolor", label: "Levolor" },
  { key: "Three_Day_Blinds", label: "Three Day Blinds" },
];

// New structure for Product Skills (Level 2)
const productSkillCheckboxes = [
  { key: "Blinds_and_Shades", label: "Blinds & Shades" },
  { key: "Shutters", label: "Shutters" },
  { key: "Draperies", label: "Drapery" },
  { key: "PowerView", label: "Motorization" }, // Renamed label
  { key: "Service_Call", label: "Service Call" },
  { key: "Tall_Window", label: "Tall Window" },
  { key: "Fixture_Displays", label: "Fixture Displays" },
  { key: "Outdoor", label: "Outdoor" },
  { key: "High_Voltage_Hardwired", label: "High Voltage Hardwired" },
];

const certificationCheckboxes = [
  { label: "Motorization Pro Certified", dbColumn: "Powerview_Certification", value: "Motorization Pro" }, // Renamed label and value
  { label: "ShutterPro Certified", dbColumn: "Shutter_Certification_Level", value: "ShutterPro Certified" },
  { label: "Master Shutter", dbColumn: "Shutter_Certification_Level", value: "Master Shutter" },
  { label: "Master Installer", dbColumn: "PIP_Certification_Level", value: "Master Installer" },
  { label: "Certified Installer", dbColumn: "PIP_Certification_Level", value: "Certified Installer" },
  { label: "Drapery Certified", dbColumn: "Draperies_Certification_Level", value: "Drapery Certified" },
];

const otherFields = [
  "Installer_Vendor_ID", "Star_Rating", "Shipment" // Moved Shipment here
];

const textAreaFields = [
  "comments", "specialnote"
];

const defaultFormState = {
  name: "",
  email: "",
  primary_phone: "",
  secondary_phone: "",
  address1: "",
  add2: "",
  city: "",
  state: "",
  postalcode: "",
  Country: "USA", // Default to USA
  // Brands
  Hunter_Douglas: false,
  Alta: false,
  Carole: false,
  Architectural: false,
  Levolor: false,
  Three_Day_Blinds: false,
  // Product Skills
  Blinds_and_Shades: false,
  PowerView: false,
  Service_Call: false,
  Shutters: false,
  Draperies: false,
  alta_motorization: false, // Removed from here
  Tall_Window: false,
  Fixture_Displays: false,
  Outdoor: false,
  High_Voltage_Hardwired: false,
  // Certifications (managed by string concatenation)
  PIP_Certification_Level: "",
  Shutter_Certification_Level: "",
  Powerview_Certification: "",
  Draperies_Certification_Level: "",
  // Other
  Installer_Vendor_ID: "",
  Shipment: false, // Moved here
  Star_Rating: "",
  specialnote: "",
  comments: "",
  Sales_Org: "", // Removed from form
};

// Mapping from frontend keys to actual database column names
const frontendKeyToDbColumnMap: { [key: string]: string } = {
  "Hunter_Douglas": "hunter_douglas",
  "Alta": "Alta",
  "Carole": "carole",
  "Architectural": "architectural",
  "Levolor": "levolor",
  "Three_Day_Blinds": "three_day_blinds",
  "Blinds_and_Shades": "Blinds_and_Shades",
  "PowerView": "PowerView",
  "Service_Call": "Service_Call",
  "Shutters": "Shutters",
  "Draperies": "Draperies",
  "alta_motorization": "alta_motorization",
  "Tall_Window": "tall_window",
  "Fixture_Displays": "fixture_displays",
  "Outdoor": "outdoor",
  "High_Voltage_Hardwired": "high_voltage_hardwired",
  "Installer_Vendor_ID": "Installer_Vendor_ID",
  "Shipment": "Shipment",
  "Star_Rating": "Star_Rating",
  "PIP_Certification_Level": "PIP_Certification_Level",
  "Shutter_Certification_Level": "Shutter_Certification_Level",
  "Powerview_Certification": "Powerview_Certification",
  "Draperies_Certification_Level": "Draperies_Certification_Level",
  "Sales_Org": "Sales_Org",
  "name": "name",
  "email": "email",
  "primary_phone": "primary_phone",
  "secondary_phone": "secondary_phone",
  "address1": "address1",
  "add2": "add2",
  "city": "city",
  "state": "state",
  "postalcode": "postalcode",
  "Country": "Country",
  "specialnote": "specialnote",
  "comments": "comments",
  "latitude": "latitude",
  "longitude": "longitude",
  "account_id": "account_id",
};

const AddInstallerModal: React.FC<AddInstallerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  loading,
}) => {
  const [formData, setFormData] = useState<any>(defaultFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { postalCodeLabel } = useCountrySettings(); // Use the country settings

  // Mapping from database column keys to user-friendly display names
  const columnDisplayNames: { [key: string]: string } = {
    name: "Name",
    email: "Email",
    primary_phone: "Phone",
    secondary_phone: "Secondary Phone",
    address1: "Address Line 1",
    add2: "Address Line 2",
    city: "City",
    state: "State",
    postalcode: postalCodeLabel, // Dynamic label
    Country: "Country",
    // Brands
    Hunter_Douglas: "Hunter Douglas",
    Alta: "Alta",
    Carole: "Carole",
    Architectural: "Architectural",
    Levolor: "Levolor",
    Three_Day_Blinds: "Three Day Blinds",
    // Product Skills
    Blinds_and_Shades: "Blinds & Shades",
    PowerView: "Motorization", // Renamed display name
    Service_Call: "Service Call",
    Shutters: "Shutters",
    Draperies: "Drapery",
    alta_motorization: "Alta Motorization", // Still in display names for consistency with DB
    Tall_Window: "Tall Window",
    Fixture_Displays: "Fixture Displays",
    Outdoor: "Outdoor",
    High_Voltage_Hardwired: "High Voltage Hardwired",
    // Certifications
    PIP_Certification_Level: "PIP Certification",
    Shutter_Certification_Level: "Shutter Certification Level",
    Powerview_Certification: "Motorization Certification", // Renamed display name
    Draperies_Certification_Level: "Drapery Certification",
    // Other
    Installer_Vendor_ID: "Installer Vendor ID",
    Shipment: "Accepts Shipments",
    Star_Rating: "Star Rating",
    specialnote: "Special Note",
    comments: "Comments",
    Sales_Org: "Sales Org",
  };

  const requiredFields = [
    "name", "email", "primary_phone", "address1", "city", "state", "postalcode"
  ];

  useEffect(() => {
    if (!isOpen) {
      setFormData(defaultFormState); // Reset form when modal closes
      setErrors({}); // Clear errors
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData((prev: any) => ({ ...prev, [name]: checked }));
  };

  const handleCertificationCheckboxChange = (dbColumn: string, value: string, checked: boolean) => {
    setFormData((prev: any) => {
      const currentCerts = prev[dbColumn] ? prev[dbColumn].split(', ').filter(Boolean) : [];
      let newCerts;
      if (checked) {
        newCerts = [...new Set([...currentCerts, value])]; // Add and ensure uniqueness
      } else {
        newCerts = currentCerts.filter((cert: string) => cert !== value); // Remove
      }
      return { ...prev, [dbColumn]: newCerts.join(', ') };
    });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    requiredFields.forEach(field => {
      if (!formData[field] || String(formData[field]).trim() === "") {
        newErrors[field] = `${columnDisplayNames[field] || field.replace(/_/g, ' ')} is required.`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const formattedData: any = {};
    for (const key in formData) {
      if (Object.prototype.hasOwnProperty.call(formData, key)) {
        const value = formData[key];
        const dbColumnName = frontendKeyToDbColumnMap[key] || key; // Use mapped name or original key

        if (typeof value === 'boolean') {
          formattedData[dbColumnName] = fromBooleanToSupabase(key, value);
        } else if (['Installer_Vendor_ID', 'Star_Rating'].includes(key) && typeof value === 'string' && value !== '') {
          // Convert numeric strings to numbers, but only if not empty
          formattedData[dbColumnName] = parseFloat(value);
        } else if (value === "") {
          // Convert empty strings to null for database insertion
          formattedData[dbColumnName] = null;
        }
        else {
          formattedData[dbColumnName] = value;
        }
      }
    }
    await onSave(formattedData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Installer</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Contact & Address Information */}
          <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Contact & Address Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
            {contactAddressFields.map((key) => {
              const value = formData[key];
              const isRequired = requiredFields.includes(key);
              return (
                <div key={key} className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor={key} className="text-right">
                    {columnDisplayNames[key] || key.replace(/_/g, ' ')}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}:
                  </Label>
                  <Input
                    id={key}
                    name={key}
                    value={value !== null && value !== undefined ? value.toString() : ''}
                    onChange={handleInputChange}
                    className={`col-span-3 ${errors[key] ? 'border-red-500' : ''}`}
                    type="text"
                  />
                  {errors[key] && <p className="col-span-4 text-right text-red-500 text-sm">{errors[key]}</p>}
                </div>
              );
            })}
          </div>

          {/* Brands & Skills Section */}
          <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Brands & Skills</h3>
          
          {/* Brands (Level 1) */}
          <div className="col-span-full">
            <h4 className="font-medium text-base mb-2">Brands (Level 1)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {brandCheckboxes
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((item) => {
                  const value = formData[item.key];
                  return (
                    <div key={item.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={item.key}
                        name={item.key}
                        checked={value}
                        onCheckedChange={(checked) => handleCheckboxChange(item.key, checked as boolean)}
                      />
                      <Label htmlFor={item.key}>{item.label}</Label>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Product Skills (Level 2) */}
          <div className="col-span-full mt-4">
            <h4 className="font-medium text-base mb-2">Product Skills (Level 2)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {productSkillCheckboxes
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((item) => {
                  const value = formData[item.key];
                  return (
                    <div key={item.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={item.key}
                        name={item.key}
                        checked={value}
                        onCheckedChange={(checked) => handleCheckboxChange(item.key, checked as boolean)}
                      />
                      <Label htmlFor={item.key}>{item.label}</Label>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Certifications */}
          <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Certifications</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 col-span-full">
            {certificationCheckboxes
              .sort((a, b) => a.label.localeCompare(b.label)) // Sort by label
              .map((cert) => {
                const currentCerts = formData[cert.dbColumn] ? formData[cert.dbColumn].split(', ').filter(Boolean) : [];
                const isChecked = currentCerts.includes(cert.value);
                return (
                  <div key={cert.label} className="flex items-center space-x-2">
                    <Checkbox
                      id={cert.label}
                      name={cert.label}
                      checked={isChecked}
                      onCheckedChange={(checked) => handleCertificationCheckboxChange(cert.dbColumn, cert.value, checked as boolean)}
                    />
                    <Label htmlFor={cert.label}>{cert.label}</Label>
                  </div>
                );
              })}
          </div>

          {/* Other Details */}
          <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Other Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
            {otherFields
              .sort((a, b) => columnDisplayNames[a]?.localeCompare(columnDisplayNames[b] || b) || a.localeCompare(b))
              .map((key) => {
                const value = formData[key];
                const isNumeric = ['Installer_Vendor_ID', 'Star_Rating'].includes(key);
                const isBoolean = ['Shipment'].includes(key); // Check for boolean type
                return (
                  <div key={key} className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor={key} className="text-right">
                      {columnDisplayNames[key] || key.replace(/_/g, ' ')}:
                    </Label>
                    {isBoolean ? (
                      <Checkbox
                        id={key}
                        name={key}
                        checked={value}
                        onCheckedChange={(checked) => handleCheckboxChange(key, checked as boolean)}
                        className="col-span-3"
                      />
                    ) : (
                      <Input
                        id={key}
                        name={key}
                        value={value !== null && value !== undefined ? value.toString() : ''}
                        onChange={handleInputChange}
                        className="col-span-3"
                        type={isNumeric ? 'number' : 'text'}
                      />
                    )}
                  </div>
                );
              })}
          </div>

          {/* Text Area Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
            {textAreaFields
              .sort((a, b) => columnDisplayNames[a]?.localeCompare(columnDisplayNames[b] || b) || a.localeCompare(b))
              .map((key) => {
                const value = formData[key];
                return (
                  <div key={key} className="grid grid-cols-4 items-start gap-4"> {/* Use items-start for textarea */}
                    <Label htmlFor={key} className="text-right pt-2"> {/* Add padding-top for label alignment */}
                      {columnDisplayNames[key] || key.replace(/_/g, ' ')}:
                    </Label>
                    <Textarea
                      id={key}
                      name={key}
                      value={value !== null && value !== undefined ? value.toString() : ''}
                      onChange={handleInputChange}
                      className="col-span-3 min-h-[80px]" // Set a minimum height
                    />
                  </div>
                );
              })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            <XCircle className="mr-2 h-4 w-4" /> Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Add Installer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddInstallerModal;
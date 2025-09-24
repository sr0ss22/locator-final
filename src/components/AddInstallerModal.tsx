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
import { useCountrySettings } from "@/hooks/useCountrySettings";

interface AddInstallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newInstallerData: any) => Promise<void>;
  loading: boolean;
}

const fromBooleanToSupabase = (value: boolean): number => {
  return value ? 1 : 0;
};

const contactAddressFields = [
  "name", "email", "primary_phone", "secondary_phone", "address1", "add2",
  "city", "state", "postalcode", "country"
];

const brandCheckboxes = [
  { key: "hunter_douglas", label: "Hunter Douglas" }, { key: "alta", label: "Alta" }, { key: "carole", label: "Carole" },
  { key: "architectural", label: "Architectural" }, { key: "levolor", label: "Levolor" }, { key: "three_day_blinds", label: "Three Day Blinds" },
];

const productSkillCheckboxes = [
  { key: "blinds_and_shades", label: "Blinds & Shades" }, { key: "shutters", label: "Shutters" }, { key: "draperies", label: "Drapery" },
  { key: "power_view", label: "Automation" }, { key: "service_call", label: "Service Call" }, { key: "tall_window", label: "Tall Window" },
  { key: "fixture_displays", label: "Fixture Displays" }, { key: "outdoor", label: "Outdoor" }, { key: "high_voltage_hardwired", label: "High Voltage Hardwired" },
];

const certificationCheckboxes = [
  { label: "Motorization Pro Certified", dbColumn: "powerview_certification", value: "Motorization Pro" },
  { label: "ShutterPro Certified", dbColumn: "shutter_certification_level", value: "ShutterPro Certified" },
  { label: "Master Shutter", dbColumn: "shutter_certification_level", value: "Master Shutter" },
  { label: "Master Installer", dbColumn: "pip_certification_level", value: "Master Installer" },
  { label: "Certified Installer", dbColumn: "pip_certification_level", value: "Certified Installer" },
  { label: "Drapery Certified", dbColumn: "draperies_certification_level", value: "Drapery Certified" },
];

const otherFields = ["installer_vendor_id", "star_rating", "shipment"];
const textAreaFields = ["comments", "specialnote"];

const defaultFormState = {
  name: "", email: "", primary_phone: "", secondary_phone: "", address1: "", add2: "", city: "", state: "", postalcode: "", country: "USA",
  hunter_douglas: false, alta: false, carole: false, architectural: false, levolor: false, three_day_blinds: false,
  blinds_and_shades: false, power_view: false, service_call: false, shutters: false, draperies: false,
  tall_window: false, fixture_displays: false, outdoor: false, high_voltage_hardwired: false,
  pip_certification_level: "", shutter_certification_level: "", powerview_certification: "", draperies_certification_level: "",
  installer_vendor_id: "", shipment: false, star_rating: "", specialnote: "", comments: "",
};

const AddInstallerModal: React.FC<AddInstallerModalProps> = ({ isOpen, onClose, onSave, loading }) => {
  const [formData, setFormData] = useState<any>(defaultFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { postalCodeLabel } = useCountrySettings();

  const columnDisplayNames: { [key: string]: string } = {
    name: "Name", email: "Email", primary_phone: "Phone", secondary_phone: "Secondary Phone", address1: "Address Line 1",
    add2: "Address Line 2", city: "City", state: "State", postalcode: postalCodeLabel, country: "Country",
    hunter_douglas: "Hunter Douglas", alta: "Alta", carole: "Carole", architectural: "Architectural", levolor: "Levolor",
    three_day_blinds: "Three Day Blinds", blinds_and_shades: "Blinds & Shades", power_view: "Automation",
    service_call: "Service Call", shutters: "Shutters", draperies: "Drapery", alta_motorization: "Alta Motorization",
    tall_window: "Tall Window", fixture_displays: "Fixture Displays", outdoor: "Outdoor", high_voltage_hardwired: "High Voltage Hardwired",
    pip_certification_level: "PIP Certification", shutter_certification_level: "Shutter Certification Level",
    powerview_certification: "Motorization Certification", draperies_certification_level: "Drapery Certification",
    installer_vendor_id: "Installer Vendor ID", shipment: "Accepts Shipments", star_rating: "Star Rating",
    specialnote: "Special Note", comments: "Comments",
  };

  const requiredFields = ["name", "email", "primary_phone", "address1", "city", "state", "postalcode"];

  useEffect(() => {
    if (!isOpen) { setFormData(defaultFormState); setErrors({}); }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => { const newErrors = { ...prev }; delete newErrors[name]; return newErrors; });
  };

  const handleCheckboxChange = (name: string, checked: boolean) => setFormData((prev: any) => ({ ...prev, [name]: checked }));

  const handleCertificationCheckboxChange = (dbColumn: string, value: string, checked: boolean) => {
    setFormData((prev: any) => {
      const currentCerts = prev[dbColumn] ? prev[dbColumn].split(', ').filter(Boolean) : [];
      const newCerts = checked ? [...new Set([...currentCerts, value])] : currentCerts.filter((cert: string) => cert !== value);
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
    if (!validateForm()) { toast.error("Please fill in all required fields."); return; }
    const formattedData: any = {};
    for (const key in formData) {
      if (Object.prototype.hasOwnProperty.call(formData, key)) {
        const value = formData[key];
        if (typeof value === 'boolean') {
          formattedData[key] = fromBooleanToSupabase(value);
        } else if (['installer_vendor_id', 'star_rating'].includes(key) && typeof value === 'string' && value !== '') {
          formattedData[key] = parseFloat(value);
        } else if (value === "") {
          formattedData[key] = null;
        } else {
          formattedData[key] = value;
        }
      }
    }
    await onSave(formattedData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add New Installer</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-4">
          <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Contact & Address Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
            {contactAddressFields.map((key) => (
              <div key={key} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={key} className="text-right">{columnDisplayNames[key] || key.replace(/_/g, ' ')}{requiredFields.includes(key) && <span className="text-red-500 ml-1">*</span>}:</Label>
                <Input id={key} name={key} value={formData[key] ?? ''} onChange={handleInputChange} className={`col-span-3 ${errors[key] ? 'border-red-500' : ''}`} type="text" />
                {errors[key] && <p className="col-span-4 text-right text-red-500 text-sm">{errors[key]}</p>}
              </div>
            ))}
          </div>
          <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Brands & Skills</h3>
          <div className="col-span-full">
            <h4 className="font-medium text-base mb-2">Brands (Level 1)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {brandCheckboxes.sort((a, b) => a.label.localeCompare(b.label)).map((item) => (
                <div key={item.key} className="flex items-center space-x-2">
                  <Checkbox id={item.key} name={item.key} checked={formData[item.key]} onCheckedChange={(checked) => handleCheckboxChange(item.key, checked as boolean)} />
                  <Label htmlFor={item.key}>{item.label}</Label>
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-full mt-4">
            <h4 className="font-medium text-base mb-2">Product Skills (Level 2)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {productSkillCheckboxes.sort((a, b) => a.label.localeCompare(b.label)).map((item) => (
                <div key={item.key} className="flex items-center space-x-2">
                  <Checkbox id={item.key} name={item.key} checked={formData[item.key]} onCheckedChange={(checked) => handleCheckboxChange(item.key, checked as boolean)} />
                  <Label htmlFor={item.key}>{item.label}</Label>
                </div>
              ))}
            </div>
          </div>
          <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Certifications</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 col-span-full">
            {certificationCheckboxes.sort((a, b) => a.label.localeCompare(b.label)).map((cert) => {
              const currentCerts = formData[cert.dbColumn] ? formData[cert.dbColumn].split(', ').filter(Boolean) : [];
              const isChecked = currentCerts.includes(cert.value);
              return (
                <div key={cert.label} className="flex items-center space-x-2">
                  <Checkbox id={cert.label} name={cert.label} checked={isChecked} onCheckedChange={(checked) => handleCertificationCheckboxChange(cert.dbColumn, cert.value, checked as boolean)} />
                  <Label htmlFor={cert.label}>{cert.label}</Label>
                </div>
              );
            })}
          </div>
          <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Other Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
            {otherFields.sort((a, b) => (columnDisplayNames[a]?.localeCompare(columnDisplayNames[b] || b) || a.localeCompare(b))).map((key) => (
              <div key={key} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={key} className="text-right">{columnDisplayNames[key] || key.replace(/_/g, ' ')}:</Label>
                {key === 'shipment' ? (
                  <Checkbox id={key} name={key} checked={formData[key]} onCheckedChange={(checked) => handleCheckboxChange(key, checked as boolean)} className="col-span-3" />
                ) : (
                  <Input id={key} name={key} value={formData[key] ?? ''} onChange={handleInputChange} className="col-span-3" type={['installer_vendor_id', 'star_rating'].includes(key) ? 'number' : 'text'} />
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
            {textAreaFields.sort((a, b) => (columnDisplayNames[a]?.localeCompare(columnDisplayNames[b] || b) || a.localeCompare(b))).map((key) => (
              <div key={key} className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor={key} className="text-right pt-2">{columnDisplayNames[key] || key.replace(/_/g, ' ')}:</Label>
                <Textarea id={key} name={key} value={formData[key] ?? ''} onChange={handleInputChange} className="col-span-3 min-h-[80px]" />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}><XCircle className="mr-2 h-4 w-4" /> Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Add Installer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddInstallerModal;
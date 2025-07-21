import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";

interface ImportInstallerTerritoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File, mode: "overwrite" | "append") => void;
  loading: boolean; // Add loading prop for button state
}

const ImportInstallerTerritoriesModal: React.FC<ImportInstallerTerritoriesModalProps> = ({
  isOpen,
  onClose,
  onImport,
  loading,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"overwrite" | "append">("append");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      if (file.type !== "text/csv") {
        toast.error("Please select a CSV file.");
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
    }
  };

  const handleImportClick = () => {
    if (!selectedFile) {
      toast.error("Please select a CSV file to import.");
      return;
    }
    onImport(selectedFile, importMode);
    // Modal will be closed by parent after import process completes
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] z-max"> {/* Added z-max here */}
        <DialogHeader>
          <DialogTitle>Import Installer Territories</DialogTitle>
          <DialogDescription>
            Upload a CSV file to assign ZIP code territories to this installer.
            <br />
            <br />
            <span className="font-semibold">Expected CSV Headers:</span>{" "}
            <code className="bg-gray-100 p-1 rounded">ZipCode</code>,{" "}
            <code className="bg-gray-100 p-1 rounded">Status</code> (Approved/Needs Approval),{" "}
            <code className="bg-gray-100 p-1 rounded">StateProvince</code>
            <br />
            <span className="text-sm text-gray-500">Example: 90210,Approved,CA</span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="csvFile" className="text-right">
              CSV File
            </Label>
            <Input
              id="csvFile"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Import Mode</Label>
            <RadioGroup
              value={importMode}
              onValueChange={(value: "overwrite" | "append") => setImportMode(value)}
              className="flex space-x-4 col-span-3"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="append" id="append" />
                <Label htmlFor="append">Append</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="overwrite" id="overwrite" />
                <Label htmlFor="overwrite">Overwrite</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleImportClick} disabled={!selectedFile || loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportInstallerTerritoriesModal;
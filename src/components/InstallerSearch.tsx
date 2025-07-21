import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useCountrySettings } from "@/hooks/useCountrySettings";

interface InstallerSearchProps {
  onSearch: (zipCode: string) => void;
}

const InstallerSearch: React.FC<InstallerSearchProps> = ({ onSearch }) => {
  const [zipCode, setZipCode] = useState("");
  const { postalCodeLabel } = useCountrySettings();

  const handleSearch = () => {
    onSearch(zipCode);
  };

  return (
    <div className="flex w-full max-w-sm items-center space-x-2">
      <Input
        type="text"
        placeholder={`Enter ${postalCodeLabel}`}
        value={zipCode}
        onChange={(e) => setZipCode(e.target.value)}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            handleSearch();
          }
        }}
        className="flex-grow"
      />
      <Button type="button" onClick={handleSearch}>
        <Search className="h-4 w-4 mr-2" /> Search
      </Button>
    </div>
  );
};

export default InstallerSearch;
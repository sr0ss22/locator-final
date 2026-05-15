import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useCountrySettings } from "@/hooks/useCountrySettings";

interface InstallerSearchProps {
  onSearch: () => void;
  value: string;
  onChange: (value: string) => void;
  // When true, the search button renders as an icon-only square button with
  // an aria-label. Used by the public locator where vertical space is tight.
  iconOnly?: boolean;
}

const InstallerSearch: React.FC<InstallerSearchProps> = ({ onSearch, value, onChange, iconOnly = false }) => {
  const { postalCodeLabel } = useCountrySettings();

  const handleSearch = () => {
    onSearch();
  };

  return (
    <div className="flex w-full max-w-sm items-center space-x-2">
      <Input
        type="text"
        placeholder={`Enter City, State, or ${postalCodeLabel}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            handleSearch();
          }
        }}
        className="flex-grow"
      />
      <Button
        type="button"
        onClick={handleSearch}
        size={iconOnly ? "icon" : "default"}
        aria-label={iconOnly ? "Search" : undefined}
      >
        {iconOnly ? (
          <Search className="h-4 w-4" />
        ) : (
          <>
            <Search className="h-4 w-4 mr-2" /> Search
          </>
        )}
      </Button>
    </div>
  );
};

export default InstallerSearch;
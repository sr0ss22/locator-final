import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useCountrySettings } from "@/hooks/useCountrySettings";

interface InstallerSearchProps {
  onSearch: (searchText: string) => void;
}

const InstallerSearch: React.FC<InstallerSearchProps> = ({ onSearch }) => {
  const [searchText, setSearchText] = useState("");
  const { postalCodeLabel } = useCountrySettings();

  const handleSearch = () => {
    onSearch(searchText);
  };

  return (
    <div className="flex w-full max-w-sm items-center space-x-2 pt-1">
      <Input
        type="text"
        placeholder={`Enter City, State, or ${postalCodeLabel}`}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
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
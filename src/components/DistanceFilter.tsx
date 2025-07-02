import React from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCountrySettings } from "@/hooks/useCountrySettings";

interface DistanceFilterProps {
  selectedRadius: number; // Always in miles
  onRadiusChange: (radius: number) => void; // Emits radius in miles
}

// Define distance options with both mile and kilometer values
const distanceOptions = [
  { miles: 50, km: 80 },
  { miles: 100, km: 150 },
  { miles: 250, km: 400 },
  { miles: 500, km: 800 },
];

const DistanceFilter: React.FC<DistanceFilterProps> = ({
  selectedRadius,
  onRadiusChange,
}) => {
  const { isCanada, distanceUnit } = useCountrySettings();

  return (
    <div className="space-y-4">
      <Separator />
      <div>
        <h3 className="font-semibold text-lg mb-2">Distance ({distanceUnit})</h3>
        <RadioGroup
          value={String(selectedRadius)} // selectedRadius is always in miles
          onValueChange={(value) => onRadiusChange(Number(value))}
          className="flex flex-wrap gap-4"
        >
          {distanceOptions.map((option) => {
            const displayDistance = isCanada ? option.km : option.miles;
            return (
              <div key={option.miles} className="flex items-center space-x-2">
                <RadioGroupItem value={String(option.miles)} id={`distance-${option.miles}`} />
                <Label htmlFor={`distance-${option.miles}`}>{displayDistance}</Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>
    </div>
  );
};

export default DistanceFilter;
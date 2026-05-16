import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface CountrySettings {
  isCanada: boolean;
  distanceUnit: 'miles' | 'km';
  postalCodeLabel: 'Zip Code' | 'Postal Code';
  toggleCountry: () => void;
  // Imperative setter so the locator pages can auto-switch country
  // after a search resolves (e.g. typing "toronto" should flip the
  // app to Canada mode so the FSA coverage overlay can paint). The
  // toggle button still works manually.
  setIsCanada: (value: boolean) => void;
}

const CountrySettingsContext = createContext<CountrySettings | undefined>(undefined);

export const CountrySettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isCanada, setIsCanada] = useState(false); // Default to US

  useEffect(() => {
    // Attempt to detect country based on browser locale
    // This is a client-side approximation. For robust detection,
    // a server-side IP geolocation service would be required.
    const userLanguage = navigator.language;
    if (userLanguage.includes('en-CA') || userLanguage.includes('fr-CA')) {
      setIsCanada(true);
    } else {
      setIsCanada(false);
    }
  }, []); // Run once on mount

  const toggleCountry = () => {
    setIsCanada((prev) => !prev);
  };

  const distanceUnit: 'miles' | 'km' = isCanada ? 'km' : 'miles';
  const postalCodeLabel: 'Zip Code' | 'Postal Code' = isCanada ? 'Postal Code' : 'Zip Code';

  const value: CountrySettings = {
    isCanada,
    distanceUnit,
    postalCodeLabel,
    toggleCountry,
    setIsCanada,
  };

  return (
    <CountrySettingsContext.Provider value={value}>
      {children}
    </CountrySettingsContext.Provider>
  );
};

export const useCountrySettings = () => {
  const context = useContext(CountrySettingsContext);
  if (context === undefined) {
    throw new Error('useCountrySettings must be used within a CountrySettingsProvider');
  }
  return context;
};
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface CountrySettings {
  isCanada: boolean;
  distanceUnit: 'miles' | 'km';
  postalCodeLabel: 'Zip Code' | 'Postal Code';
  // toggleCountry is removed as it's not needed for the public view
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

  const distanceUnit = isCanada ? 'km' : 'miles';
  const postalCodeLabel = isCanada ? 'Postal Code' : 'Zip Code';

  const value = {
    isCanada,
    distanceUnit,
    postalCodeLabel,
    // toggleCountry is no longer part of the context value
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
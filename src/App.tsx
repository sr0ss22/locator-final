import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Locator from "./pages/Locator";
import InstallerManagement from "./pages/InstallerManagement";
import TerritoryManagement from "./pages/TerritoryManagement";
import EditInstallerPage from "./pages/EditInstallerPage";
import { CountrySettingsProvider } from "./hooks/useCountrySettings";
import Login from "./pages/Login";
import { SessionContextProvider } from "./components/SessionContextProvider";
import PublicLocator from "./pages/PublicLocator"; // Import the new PublicLocator component

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <CountrySettingsProvider>
          <SessionContextProvider>
            <Routes>
              <Route path="/" element={<Locator />} />
              <Route path="/locator" element={<Locator />} />
              <Route path="/installers" element={<InstallerManagement />} />
              <Route path="/installers/edit/:installerId" element={<EditInstallerPage />} />
              <Route path="/territories" element={<TerritoryManagement />} />
              <Route path="/login" element={<Login />} />
              {/* Add the new public route here */}
              <Route path="/public-locator" element={<PublicLocator />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </SessionContextProvider>
        </CountrySettingsProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
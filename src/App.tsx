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
import PublicLocator from "./pages/PublicLocator";
import ProtectedRoute from "./components/ProtectedRoute"; // Import the new component

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
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/public-locator" element={<PublicLocator />} />

              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Locator />} />
                <Route path="/locator" element={<Locator />} />
                <Route path="/installers" element={<InstallerManagement />} />
                <Route path="/installers/edit/:installerId" element={<EditInstallerPage />} />
                <Route path="/territories" element={<TerritoryManagement />} />
              </Route>

              {/* Catch-all Not Found Route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </SessionContextProvider>
        </CountrySettingsProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CountrySettingsProvider } from "./hooks/useCountrySettings";
import { SessionContextProvider } from "./components/SessionContextProvider";
import { Loader2 } from "lucide-react";

// Eagerly load public-facing and essential components
import PublicLocator from "./pages/PublicLocator";
import Login from "./pages/Login";
import UpdatePassword from "./pages/UpdatePassword";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

// Lazily load protected or less-frequently accessed routes
const Locator = lazy(() => import("./pages/Locator"));
const InstallerManagement = lazy(() => import("./pages/InstallerManagement"));
const TerritoryManagement = lazy(() => import("./pages/TerritoryManagement"));
const EditInstallerPage = lazy(() => import("./pages/EditInstallerPage"));
const ClaimProfilePage = lazy(() => import("./pages/ClaimProfile"));
const AdminToolsPage = lazy(() => import("./pages/AdminTools"));

const queryClient = new QueryClient();

const LoadingFallback = () => (
  <div className="min-h-screen w-full flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <CountrySettingsProvider>
          <SessionContextProvider>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<PublicLocator />} />
                <Route path="/login" element={<Login />} />
                <Route path="/public-locator" element={<PublicLocator />} />
                <Route path="/update-password" element={<UpdatePassword />} />

                {/* Special route for installers to claim their profile */}
                <Route path="/claim-profile" element={<ClaimProfilePage />} />

                {/* Protected Routes - All routes within this element require authentication and role check */}
                <Route element={<ProtectedRoute />}>
                  {/* These are the actual protected routes */}
                  <Route path="/locator" element={<Locator />} />
                  <Route path="/installers" element={<InstallerManagement />} />
                  <Route path="/installers/edit/:installerId" element={<EditInstallerPage />} />
                  <Route path="/territories" element={<TerritoryManagement />} />
                  <Route path="/admin-tools" element={<AdminToolsPage />} />
                </Route>

                {/* Catch-all Not Found Route */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </SessionContextProvider>
        </CountrySettingsProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
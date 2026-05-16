import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { CountrySettingsProvider } from "./hooks/useCountrySettings";
import { SessionContextProvider } from "./components/SessionContextProvider";
import LoadingSayings from "./components/LoadingSayings";
import Footer from "./components/Footer";

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
const PublicTerritoryEditor = lazy(() => import("./pages/PublicTerritoryEditor"));

const queryClient = new QueryClient();

const LoadingFallback = () => (
  <div className="min-h-screen w-full flex items-center justify-center bg-background">
    <LoadingSayings />
  </div>
);

// Wraps every route: page content grows to fill remaining viewport
// height, footer sticks to the bottom.
const Layout = () => (
  <div className="flex flex-col min-h-screen">
    <div className="flex-1">
      <Outlet />
    </div>
    <Footer />
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
                <Route element={<Layout />}>
                  {/* Public Routes */}
                  <Route path="/" element={<PublicLocator />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/public-locator" element={<PublicLocator />} />
                  <Route path="/update-password" element={<UpdatePassword />} />
                  <Route path="/territory-editor/:installerId/:token" element={<PublicTerritoryEditor />} />
                  <Route path="/claim-profile" element={<ClaimProfilePage />} />

                  {/* Protected Routes */}
                  <Route element={<ProtectedRoute />}>
                    <Route path="/locator" element={<Locator />} />
                    <Route path="/installers" element={<InstallerManagement />} />
                    <Route path="/installers/edit/:installerId" element={<EditInstallerPage />} />
                    <Route path="/territories" element={<TerritoryManagement />} />
                    <Route path="/admin-tools" element={<AdminToolsPage />} />
                  </Route>

                  {/* Catch-all Not Found Route */}
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </SessionContextProvider>
        </CountrySettingsProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
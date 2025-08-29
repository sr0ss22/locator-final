import React, { useEffect, useState } from 'react';
import { useSession } from './SessionContextProvider';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from './ui/button'; // Ensure Button is imported

const ProtectedRoute: React.FC = () => {
  const { user, profile, loading: sessionLoading } = useSession();
  const [installerId, setInstallerId] = useState<string | null>(null);
  const [loadingInstallerId, setLoadingInstallerId] = useState(true);
  const location = useLocation();
  const params = useParams();

  // Console logs for debugging the flow
  console.log("ProtectedRoute: sessionLoading", sessionLoading);
  console.log("ProtectedRoute: user", user);
  console.log("ProtectedRoute: profile", profile);
  console.log("ProtectedRoute: location.pathname", location.pathname);

  useEffect(() => {
    if (user && profile?.role === 'installer') {
      const fetchInstallerId = async () => {
        setLoadingInstallerId(true);
        console.log("ProtectedRoute: Fetching installer ID for user:", user.id);
        const { data, error } = await supabase
          .from('installers')
          .select('id')
          .eq('account_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found, which is a valid state
          console.error("ProtectedRoute: Error fetching installer ID:", error);
          toast.error("Could not verify your installer profile.");
        } else if (error && error.code === 'PGRST116') {
          console.log("ProtectedRoute: No installer profile found for user:", user.id);
        }
        setInstallerId(data?.id || null);
        setLoadingInstallerId(false);
        console.log("ProtectedRoute: Installer ID fetched:", data?.id || null);
      };
      fetchInstallerId();
    } else {
      setLoadingInstallerId(false);
      setInstallerId(null); // Ensure installerId is reset if role changes or user logs out
    }
  }, [user, profile]);

  console.log("ProtectedRoute: loadingInstallerId", loadingInstallerId);
  console.log("ProtectedRoute: installerId", installerId);

  if (sessionLoading || loadingInstallerId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <p className="ml-2 text-gray-500">Loading user session...</p>
      </div>
    );
  }

  // If no user is authenticated, redirect to the login page
  if (!user) {
    console.log("ProtectedRoute: No user, redirecting to /login");
    toast.info("Please log in to access this page.");
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // User is authenticated, now check role and installer profile
  if (profile?.role === 'admin') {
    console.log("ProtectedRoute: User is admin.");
    // Admins should default to /installers if they land on /login or other non-admin default routes
    if (location.pathname === '/login' || location.pathname === '/') {
      console.log("ProtectedRoute: Admin on /login or root, redirecting to /installers");
      return <Navigate to="/installers" replace />;
    }
    console.log("ProtectedRoute: Admin rendering Outlet.");
    return <Outlet />;
  }

  if (profile?.role === 'installer') {
    console.log("ProtectedRoute: User is installer.");
    if (!installerId) {
      console.log("ProtectedRoute: Installer has no installerId, showing Account Pending.");
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="text-center bg-white p-8 rounded-lg shadow-md">
            <h1 className="text-2xl font-bold mb-4 text-gray-800">Account Pending</h1>
            <p className="text-gray-600">Your account is not yet associated with an installer profile. Please contact an administrator for assistance.</p>
            <Button onClick={() => supabase.auth.signOut()} className="mt-6">Log Out</Button>
          </div>
        </div>
      );
    }

    // Installer has an installerId
    const installerEditPath = `/installers/edit/${installerId}`;
    console.log("ProtectedRoute: Installer ID exists:", installerId);
    console.log("ProtectedRoute: Installer's designated edit path:", installerEditPath);

    // If installer is on /login or any other protected route (including root for authenticated users)
    // that is not their specific edit page, redirect them to their edit page.
    const isTryingToAccessOtherProtected = (
      location.pathname === '/login' ||
      location.pathname === '/installers' ||
      location.pathname === '/territories' ||
      location.pathname === '/locator' ||
      location.pathname === '/' || // Root path for authenticated users
      (location.pathname.startsWith('/installers/edit/') && params.installerId !== installerId)
    );

    if (isTryingToAccessOtherProtected) {
      if (location.pathname.startsWith('/installers/edit/') && params.installerId !== installerId) {
        toast.error("You do not have permission to view this page.");
      }
      console.log("ProtectedRoute: Installer trying to access other protected route, redirecting to their edit page.");
      return <Navigate to={installerEditPath} replace />;
    }
    
    console.log("ProtectedRoute: Installer rendering Outlet for their own edit page.");
    return <Outlet />;
  }

  // Fallback for users with no role or an unknown role (should ideally not happen if profile is fetched)
  console.log("ProtectedRoute: User has unknown role or no role, redirecting to /login.");
  toast.error("Your user role could not be determined. Please log in again.");
  return <Navigate to="/login" replace />;
};

export default ProtectedRoute;
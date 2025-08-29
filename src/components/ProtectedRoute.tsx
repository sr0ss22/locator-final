import React, { useEffect, useState } from 'react';
import { useSession } from './SessionContextProvider';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ProtectedRoute: React.FC = () => {
  const { user, profile, loading: sessionLoading } = useSession();
  const [installerId, setInstallerId] = useState<string | null>(null);
  const [loadingInstallerId, setLoadingInstallerId] = useState(true);
  const location = useLocation();
  const params = useParams();

  useEffect(() => {
    if (user && profile?.role === 'installer') {
      const fetchInstallerId = async () => {
        setLoadingInstallerId(true);
        const { data, error } = await supabase
          .from('installers')
          .select('id')
          .eq('account_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found, which is a valid state
          console.error("Error fetching installer ID:", error);
          toast.error("Could not verify your installer profile.");
        }
        setInstallerId(data?.id || null);
        setLoadingInstallerId(false);
      };
      fetchInstallerId();
    } else {
      setLoadingInstallerId(false);
    }
  }, [user, profile]);

  if (sessionLoading || loadingInstallerId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile?.role === 'admin') {
    return <Outlet />;
  }

  if (profile?.role === 'installer') {
    if (!installerId) {
      return (
        <div className="min-h-screen flex items-center justify-center text-center p-4">
          <div>
            <h1 className="text-2xl font-bold mb-4">Account Pending</h1>
            <p className="text-gray-600">Your account is not yet associated with an installer profile. Please contact an administrator for assistance.</p>
            <Button onClick={() => supabase.auth.signOut()} className="mt-6">Log Out</Button>
          </div>
        </div>
      );
    }

    // If an installer tries to access the main installer list, redirect them to their own page.
    if (location.pathname === '/installers') {
      return <Navigate to={`/installers/edit/${installerId}`} replace />;
    }

    // If an installer tries to access an edit page that isn't theirs, redirect them.
    if (location.pathname.startsWith('/installers/edit/') && params.installerId !== installerId) {
      toast.error("You do not have permission to view this page.");
      return <Navigate to={`/installers/edit/${installerId}`} replace />;
    }
    
    // If an installer tries to access any other protected route, redirect them.
    if (location.pathname === '/territories' || location.pathname === '/locator' || location.pathname === '/') {
        return <Navigate to={`/installers/edit/${installerId}`} replace />;
    }

    return <Outlet />;
  }

  // Fallback for users with no role or an unknown role
  return <Navigate to="/login" replace />;
};

export default ProtectedRoute;
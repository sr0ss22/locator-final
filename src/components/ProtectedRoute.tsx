import React, { useEffect, useRef, useState } from 'react';
import { useSession } from './SessionContextProvider';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import LoadingSayings from './LoadingSayings';

const ProtectedRoute: React.FC = () => {
  const { user, profile, loading: sessionLoading } = useSession();
  const [installerId, setInstallerId] = useState<string | null>(null);
  const [loadingInstallerId, setLoadingInstallerId] = useState(true);
  const location = useLocation();
  const params = useParams();
  const authErrorShownRef = useRef(false);

  useEffect(() => {
    if (user && profile?.role === 'installer') {
      const fetchInstallerId = async () => {
        setLoadingInstallerId(true);
        const { data, error } = await supabase
          .from('installers')
          .select('id')
          .eq('account_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('ProtectedRoute: Error fetching installer ID:', error);
          toast.error('Could not verify your installer profile.');
        }
        setInstallerId(data?.id || null);
        setLoadingInstallerId(false);
      };
      fetchInstallerId();
    } else {
      setLoadingInstallerId(false);
      setInstallerId(null);
    }
  }, [user, profile]);

  useEffect(() => {
    if (sessionLoading || loadingInstallerId || !user) {
      authErrorShownRef.current = false;
      return;
    }

    if (profile?.role === 'admin' || profile?.role === 'installer') {
      authErrorShownRef.current = false;
      return;
    }

    if (authErrorShownRef.current) return;
    authErrorShownRef.current = true;

    if (!profile) {
      toast.error('Could not load your profile. Please try again.');
    } else {
      toast.error('Your user role could not be determined. Please log in again.');
    }
  }, [sessionLoading, loadingInstallerId, user, profile]);

  if (sessionLoading || loadingInstallerId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSayings />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile?.role === 'admin') {
    if (location.pathname === '/login' || location.pathname === '/') {
      return <Navigate to="/installers" replace />;
    }
    return <Outlet />;
  }

  if (profile?.role === 'installer') {
    if (!installerId) {
      return <Navigate to="/claim-profile" replace />;
    }

    const installerEditPath = `/installers/edit/${installerId}`;
    const isTryingToAccessOtherProtected = (
      location.pathname === '/login' ||
      location.pathname === '/installers' ||
      location.pathname === '/territories' ||
      location.pathname === '/locator' ||
      location.pathname === '/' ||
      (location.pathname.startsWith('/installers/edit/') && params.installerId !== installerId)
    );

    if (isTryingToAccessOtherProtected) {
      if (location.pathname.startsWith('/installers/edit/') && params.installerId !== installerId) {
        toast.error('You do not have permission to view this page.');
      }
      return <Navigate to={installerEditPath} replace />;
    }

    return <Outlet />;
  }

  return <Navigate to="/login" replace />;
};

export default ProtectedRoute;

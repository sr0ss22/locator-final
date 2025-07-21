import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { UserProfile } from '@/types/territory'; // Assuming UserProfile is defined here

interface SessionContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  supabase: typeof supabase;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const fetchSessionAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user || null);

      if (session?.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          console.error("Error fetching user profile:", profileError);
          toast.error("Failed to load user profile.");
          setProfile(null);
        } else {
          setProfile(profileData as UserProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    };

    fetchSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      setLoading(true); // Set loading true while profile is being fetched

      if (session?.user) {
        // Fetch profile on sign-in or user update
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profileData, error: profileError }) => {
            if (profileError) {
              console.error("Error fetching user profile on auth state change:", profileError);
              toast.error("Failed to load user profile.");
              setProfile(null);
            } else {
              setProfile(profileData as UserProfile);
            }
            setLoading(false);
          });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle redirects based on authentication state and current path
  useEffect(() => {
    const protectedRoutes = ['/installers', '/territories', '/installers/edit']; // Add any other protected routes
    const isProtectedRoute = protectedRoutes.some(route => location.pathname.startsWith(route));
    const isLoginPage = location.pathname === '/login';

    if (loading) {
      // Still loading session, do nothing yet
      return;
    }

    if (session && user) {
      // User is authenticated
      if (isLoginPage) {
        navigate('/'); // Redirect authenticated users away from login page
      }
    } else {
      // User is NOT authenticated
      if (isProtectedRoute) {
        toast.info("Please log in to access this page.");
        navigate('/login'); // Redirect unauthenticated users to login page
      }
    }
  }, [session, user, loading, location.pathname, navigate]);

  const value = { session, user, profile, loading, supabase };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionContextProvider');
  }
  return context;
};
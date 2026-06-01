import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';

function Login() {
  const navigate = useNavigate();
  const { user, profile, loading } = useSession();

  // Wait until the profile is loaded before entering protected routes.
  // ProtectedRoute uses profile.role for routing; navigating earlier caused a
  // race where the user was authenticated but role was still unknown.
  useEffect(() => {
    if (loading || !user || !profile) return;
    navigate('/installers', { replace: true });
  }, [loading, user, profile, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sign in to your account
        </h2>
        <Auth
          supabaseClient={supabase}
          providers={[]}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'hsl(var(--primary))',
                  brandAccent: 'hsl(var(--primary-foreground))',
                },
              },
            },
          }}
          theme="light"
        />
      </div>
    </div>
  );
}

export default Login;

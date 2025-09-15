import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, LogOut } from 'lucide-react';

const ClaimProfilePage: React.FC = () => {
  const { user, profile, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Logout failed: " + error.message);
    } else {
      toast.success("You have been logged out.");
      navigate('/login');
    }
  };

  useEffect(() => {
    const checkAndRedirect = async () => {
      if (sessionLoading) {
        return; // Wait for the session to finish loading
      }

      setCheckingProfile(true);

      if (!user) {
        navigate('/login');
        return;
      }

      if (profile?.role === 'admin') {
        navigate('/installers');
        return;
      }

      if (profile?.role === 'installer') {
        // Check if the installer is already linked to a profile
        const { data, error } = await supabase
          .from('installers')
          .select('id')
          .eq('account_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // Ignore 'not found' errors
          toast.error("Error checking your installer profile status.");
        } else if (data?.id) {
          // If they are linked, redirect them to their edit page
          navigate(`/installers/edit/${data.id}`);
          return;
        }
      }
      
      // If no redirect happened, it means they need to be on this page
      setCheckingProfile(false);
    };

    checkAndRedirect();
  }, [user, profile, sessionLoading, navigate]);

  const handleClaimProfile = async () => {
    if (!email) {
      toast.error('Please enter your installer email address.');
      return;
    }
    setLoading(true);
    const loadingToastId = toast.loading('Verifying your profile...');

    const { data, error } = await supabase.rpc('claim_installer_profile', {
      installer_email: email,
    });

    setLoading(false);
    toast.dismiss(loadingToastId);

    if (error) {
      console.error('Error claiming profile:', error);
      toast.error('An unexpected error occurred. Please try again.');
      return;
    }

    switch (data) {
      case 'success':
        toast.success('Profile claimed successfully! Refreshing your session...');
        // A simple page reload is the most robust way to refresh the user's session and profile data.
        window.location.reload();
        break;
      case 'not_found':
        toast.error('No installer profile found with that email. Please check the email or contact an administrator.');
        break;
      case 'already_claimed':
        toast.error('This installer profile is already linked to another account. Please contact an administrator.');
        break;
      case 'already_claimed_by_you':
        toast.info('This profile is already linked to your account. Refreshing...');
        window.location.reload();
        break;
      default:
        toast.error('An unknown response was received. Please try again.');
    }
  };

  if (sessionLoading || checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Claim Your Installer Profile</CardTitle>
          <CardDescription>
            To access your installer dashboard, please verify the email address associated with your installer profile. This may be different from your login email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Installer Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your installer email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button onClick={handleClaimProfile} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Claim Profile
          </Button>
          <Button variant="link" onClick={handleLogout} disabled={loading} className="w-full text-sm">
            <LogOut className="mr-2 h-4 w-4" /> Not you? Log Out
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ClaimProfilePage;
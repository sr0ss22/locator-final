import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const ClaimProfilePage: React.FC = () => {
  const { user, profile, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionLoading) {
      // If not logged in, go to login
      if (!user) {
        navigate('/login');
      }
      // If user is an admin, they don't need to be here
      else if (profile?.role === 'admin') {
        navigate('/installers');
      }
    }
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

  if (sessionLoading) {
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
        <CardFooter>
          <Button onClick={handleClaimProfile} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Claim Profile
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ClaimProfilePage;
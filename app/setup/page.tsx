import { cookies } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SetupForm } from "@/components/setup-form";
import { Mail } from "lucide-react";

export default async function SetupPage() {
  const cookieStore = await cookies();
  const setupEmail = cookieStore.get("setup_email")?.value;

  if (!setupEmail) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <Alert className="max-w-lg">
          <Mail className="h-4 w-4" />
          <AlertTitle>Complete Gmail sign-in first</AlertTitle>
          <AlertDescription className="mt-2">
            Connect your Gmail account to link your rules sheet and start auto-labeling.
          </AlertDescription>
          <div className="mt-4">
            <Button asChild>
              <Link href="/api/auth/gmail">Connect Gmail</Link>
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return <SetupForm />;
}

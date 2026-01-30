import { cookies } from "next/headers";
import Link from "next/link";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SetupForm } from "@/components/setup-form";
import { Mail } from "lucide-react";

export default async function SetupPage() {
  const cookieStore = await cookies();
  const setupEmail = cookieStore.get("setup_email")?.value;
  const stripeCheckoutUrl = process.env.STRIPE_CHECKOUT_URL ?? "";

  if (!setupEmail) {
    return (
      <main className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-2xl px-6 py-12">
          <Alert>
            <Mail className="h-4 w-4" />
            <AlertTitle>Complete Gmail sign-in first</AlertTitle>
            <AlertDescription className="mt-2">
              Connect your Gmail account so we can link your rules sheet to your account. Then you’ll add your Google Sheet and complete payment.
            </AlertDescription>
            <div className="mt-4">
              <Button asChild>
                <Link href="/api/auth/gmail">Connect Gmail</Link>
              </Button>
            </div>
          </Alert>
        </div>
      </main>
    );
  }

  return <SetupForm stripeCheckoutUrl={stripeCheckoutUrl} />;
}

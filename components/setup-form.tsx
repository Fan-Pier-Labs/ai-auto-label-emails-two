"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileSpreadsheet, Info } from "lucide-react";

interface SetupFormProps {
  stripeCheckoutUrl: string;
}

export function SetupForm({ stripeCheckoutUrl }: SetupFormProps) {
  const [sheetUrl, setSheetUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/setup/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet_url: sheetUrl.trim() }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error ?? data.message ?? "Failed to save sheet");
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Network error");
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Add your rules sheet
            </CardTitle>
            <CardDescription>
              You’ve connected Gmail. Add a Google Sheet that defines your labeling rules. You can do this now or after payment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>How your sheet is used</AlertTitle>
              <AlertDescription className="mt-1 space-y-2">
                <p>
                  <strong>First sheet (tab):</strong> AI rules. One row per rule with columns like &quot;Label&quot; and &quot;AI Prompt&quot;. Each row defines a label and the prompt used to decide when to apply it.
                </p>
                <p>
                  <strong>Second sheet (tab):</strong> Deterministic rules. Columns like &quot;rule_name&quot; and &quot;enabled&quot; to turn rules on or off (e.g. new-domain, domain-down, smtp-*). Optional; defaults are used if missing.
                </p>
                <p className="text-muted-foreground">
                  The processor reads this sheet every time it processes an email (no caching), so edits take effect on the next run.
                </p>
              </AlertDescription>
            </Alert>

            {status === "success" ? (
              <Alert variant="default">
                <AlertTitle>Sheet saved</AlertTitle>
                <AlertDescription>
                  Your sheet URL has been saved. Complete payment to start auto-labeling.
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sheet_url">Google Sheet URL or ID</Label>
                  <Input
                    id="sheet_url"
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/... or paste the sheet ID"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    disabled={status === "loading"}
                    className="font-mono text-sm"
                  />
                </div>
                {status === "error" && errorMessage && (
                  <Alert variant="destructive">
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" disabled={status === "loading" || !sheetUrl.trim()}>
                  {status === "loading" ? "Saving…" : "Save sheet"}
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2 border-t pt-6">
            <p className="text-muted-foreground text-sm">
              Complete payment within 30 minutes so your Gmail and sheet settings are linked to your account.
            </p>
            {stripeCheckoutUrl ? (
              <Button asChild size="lg" className="w-full">
                <Link href={stripeCheckoutUrl}>Continue to payment</Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline" className="w-full" disabled>
                <span>Continue to payment (configure STRIPE_CHECKOUT_URL)</span>
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

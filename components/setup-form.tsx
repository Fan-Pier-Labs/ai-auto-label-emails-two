"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileSpreadsheet, ExternalLink, Loader2 } from "lucide-react";


export function SetupForm() {
  const [sheetUrl, setSheetUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "redirecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setErrorMessage(null);

    try {
      // Step 1: Save the sheet URL
      const sheetRes = await fetch("/api/setup/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet_url: sheetUrl.trim() }),
        credentials: "include",
      });
      const sheetData = await sheetRes.json().catch(() => ({}));
      if (!sheetRes.ok) {
        setStatus("error");
        setErrorMessage(sheetData.error ?? sheetData.message ?? "Failed to save sheet");
        return;
      }

      // Step 2: Create Stripe checkout session and redirect
      setStatus("redirecting");
      const checkoutRes = await fetch("/api/checkout/create", {
        method: "POST",
        credentials: "include",
      });
      const checkoutData = await checkoutRes.json().catch(() => ({}));
      if (!checkoutRes.ok) {
        setStatus("error");
        setErrorMessage(checkoutData.error ?? "Failed to create checkout session");
        return;
      }

      // Redirect to Stripe checkout
      window.location.href = checkoutData.url;
    } catch {
      setStatus("error");
      setErrorMessage("Network error");
    }
  }

  const isLoading = status === "saving" || status === "redirecting";

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <Card className="w-full max-w-lg">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileSpreadsheet className="h-5 w-5" />
              Add your rules sheet
            </CardTitle>
            <CardDescription>
              Connect a Google Sheet that defines your labeling rules.
              <p className="text-sm text-muted-foreground mb-3 mt-2">
                <a
                  href={process.env.NEXT_TEMPLATE_SHEET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline underline-offset-4 hover:no-underline"
                >
                  Copy our template
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and use <strong>File → Make a copy</strong>.
              </p>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">

              <div className="space-y-2">
                <Label htmlFor="sheet_url">Your labeling rules Google Sheet URL</Label>
                <Input
                  id="sheet_url"
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  disabled={isLoading}
                  className="font-mono text-sm"
                />
              </div>

              {status === "error" && errorMessage && (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isLoading || !sheetUrl.trim()}
              >
                {status === "saving" && (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                )}
                {status === "redirecting" && (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting to payment...
                  </>
                )}
                {(status === "idle" || status === "error") && "Continue to payment"}
              </Button>
            </form>

            <div className="pt-2 border-t">
              
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground transition-colors">
                  How the sheet works
                </summary>
                <div className="mt-2 space-y-2 pl-4 border-l-2 border-muted">
                  <p>
                    <strong>AI rules:</strong> Columns A-E. Each row defines a label and the AI prompt to decide when to apply it.
                  </p>
                  <p>
                    <strong>Deterministic rules:</strong> Columns F-H. Enable/disable rules like <code className="text-xs bg-muted px-1 rounded">domain-down</code>, <code className="text-xs bg-muted px-1 rounded">new-domain</code>, <code className="text-xs bg-muted px-1 rounded">smtp-automation</code>.
                  </p>
                  <p className="text-xs">
                    Changes take effect on the next email processed.
                  </p>
                </div>
              </details>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

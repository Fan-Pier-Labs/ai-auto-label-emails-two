import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function CheckoutSuccessPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-8">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-8 space-y-4">
          <div className="flex justify-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
          </div>
          <h1 className="text-2xl font-semibold">
            Thanks, we got it from here.
          </h1>
          <p className="text-muted-foreground">
            Our AI will start labeling your emails shortly.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

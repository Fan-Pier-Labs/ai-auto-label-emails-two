import { Check, Server, Cloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function Options() {
  return (
    <section id="options" className="px-4 sm:px-6 py-12 sm:py-24 overflow-x-hidden">
      <div className="mx-auto max-w-5xl w-full">
        <div className="mb-8 sm:mb-16 text-center">
          <h2 className="mb-2 sm:mb-4 text-2xl sm:text-3xl font-bold text-foreground md:text-4xl">
            Choose Your Path
          </h2>
          <p className="mx-auto max-w-2xl text-sm sm:text-base text-muted-foreground">
            Self-host for complete control, or let us handle the infrastructure for you.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-8 md:grid-cols-2">
          {/* Self-Host Option */}
          <div className="flex flex-col rounded-xl sm:rounded-2xl border border-border bg-card p-4 sm:p-8">
            <div className="mb-4 sm:mb-6 flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-lg sm:rounded-xl bg-muted">
              <Server className="h-5 w-5 sm:h-7 sm:w-7 text-foreground" />
            </div>
            
            <h3 className="mb-1.5 sm:mb-2 text-xl sm:text-2xl font-bold text-foreground">Self-Host</h3>
            <p className="mb-4 sm:mb-6 text-sm sm:text-base text-muted-foreground">
              Follow our documentation to set up the project on your own server. Full control, completely free.
            </p>

            <div className="mb-4 sm:mb-8 flex-1 space-y-2 sm:space-y-3">
              <div className="flex items-start gap-2 sm:gap-3">
                <Check className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                <span className="text-xs sm:text-sm text-foreground">100% free and open source</span>
              </div>
              <div className="flex items-start gap-2 sm:gap-3">
                <Check className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                <span className="text-xs sm:text-sm text-foreground">Full control over your data</span>
              </div>
              <div className="flex items-start gap-2 sm:gap-3">
                <Check className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                <span className="text-xs sm:text-sm text-foreground">Use local AI with Ollama</span>
              </div>
              <div className="flex items-start gap-2 sm:gap-3">
                <Check className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                <span className="text-xs sm:text-sm text-foreground">Deploy anywhere (Docker, AWS, etc.)</span>
              </div>
            </div>

            <div className="border-t border-border pt-4 sm:pt-6">
              <p className="mb-3 sm:mb-4 text-2xl sm:text-3xl font-bold text-foreground">Free</p>
              <Button asChild variant="outline" className="w-full bg-transparent text-sm sm:text-base">
                <Link href="https://github.com/Fan-Pier-Labs/ai-auto-label-emails-two" target="_blank">
                  View Documentation
                </Link>
              </Button>
            </div>
          </div>

          {/* Hosted Option */}
          <div className="relative flex flex-col rounded-xl sm:rounded-2xl border-2 border-primary bg-card p-4 sm:p-8">
            <div className="absolute -top-3 right-4 sm:right-6 rounded-full bg-primary px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium text-primary-foreground">
              Recommended
            </div>
            
            <div className="mb-4 sm:mb-6 flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-lg sm:rounded-xl bg-primary">
              <Cloud className="h-5 w-5 sm:h-7 sm:w-7 text-primary-foreground" />
            </div>
            
            <h3 className="mb-1.5 sm:mb-2 text-xl sm:text-2xl font-bold text-foreground">Hosted</h3>
            <p className="mb-4 sm:mb-6 text-sm sm:text-base text-muted-foreground">
              We handle all the technical setup. Just connect your Gmail and start labeling in minutes.
            </p>

            <div className="mb-4 sm:mb-8 flex-1 space-y-2 sm:space-y-3">
              <div className="flex items-start gap-2 sm:gap-3">
                <Check className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                <span className="text-xs sm:text-sm text-foreground">No technical setup required</span>
              </div>
              <div className="flex items-start gap-2 sm:gap-3">
                <Check className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                <span className="text-xs sm:text-sm text-foreground">Automatic updates and maintenance</span>
              </div>
              <div className="flex items-start gap-2 sm:gap-3">
                <Check className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                <span className="text-xs sm:text-sm text-foreground">Premium AI models included</span>
              </div>
              <div className="flex items-start gap-2 sm:gap-3">
                <Check className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                <span className="text-xs sm:text-sm text-foreground">Priority support from our team</span>
              </div>
            </div>

            <div className="border-t border-border pt-4 sm:pt-6">
              <p className="mb-1 text-2xl sm:text-3xl font-bold text-foreground">$9<span className="text-base sm:text-lg font-normal text-muted-foreground">/month</span></p>
              <p className="mb-3 sm:mb-4 text-xs sm:text-sm text-muted-foreground">Cancel anytime</p>
              <Button asChild className="w-full text-sm sm:text-base">
                <Link href="/api/auth/gmail">
                  <span className="hidden sm:inline">Get Started</span>
                  <span className="sm:hidden">Get Started - email ryan@fanpierlabs.com</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

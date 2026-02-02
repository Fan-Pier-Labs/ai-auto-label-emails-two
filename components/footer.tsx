import Link from "next/link"
import { Mail } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t border-border bg-card px-4 sm:px-6 py-8 sm:py-12 overflow-hidden max-w-[100vw]">
      <div className="mx-auto max-w-6xl w-full">
        <div className="flex flex-col items-center justify-between gap-4 sm:gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Mail className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">AutoLabel</span>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Built by{" "}
            <Link 
              href="https://fanpierlabs.com" 
              target="_blank"
              className="underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Fan Pier Labs
            </Link>
            . Need custom AI tools?{" "}
            <Link 
              href="https://fanpierlabs.com" 
              target="_blank"
              className="underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Let's talk.
            </Link>
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <Link 
              href="https://fanpierlabs.com/privacy_policy.html" 
              target="_blank"
              className="text-xs sm:text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link 
              href="https://fanpierlabs.com/terms.pdf" 
              target="_blank"
              className="text-xs sm:text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <Link 
              href="https://github.com/Fan-Pier-Labs/ai-auto-label-emails-two" 
              target="_blank"
              className="text-xs sm:text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              GitHub
            </Link>
            <Link 
              href="https://fanpierlabs.com" 
              target="_blank"
              className="text-xs sm:text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

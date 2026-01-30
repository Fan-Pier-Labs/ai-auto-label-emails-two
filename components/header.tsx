"use client"

import Link from "next/link"
import { Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Header() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Mail className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">AutoLabel</span>
        </Link>
        
        <nav className="hidden items-center gap-6 md:flex">
          <Link 
            href="/#features" 
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </Link>
          <Link 
            href="/#options" 
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Get Started
          </Link>
          <Link 
            href="https://fanpierlabs.com" 
            target="_blank"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Fan Pier Labs
          </Link>
        </nav>

        <Button asChild size="sm">
          <Link href="/#options">Get Started</Link>
        </Button>
      </div>
    </header>
  )
}

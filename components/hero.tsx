"use client"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function Hero() {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>Free &amp; Open Source</span>
        </div>
        
        <h1 className="mb-6 text-balance text-4xl font-bold tracking-tight text-foreground md:text-6xl">
          Auto Label Emails with AI
        </h1>
        
        <p className="mx-auto mb-10 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
          Set up custom Gmail labels that are automatically applied using AI smart rules. 
          Save time and never miss important emails again.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button asChild size="lg" className="gap-2">
            <Link href="#demo">
              Try Demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="#options">
              Get Started
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { Features } from "@/components/features"
import { InteractiveDemo } from "@/components/interactive-demo"
import { Options } from "@/components/options"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <Hero />
      <Features />
      <InteractiveDemo />
      <Options />
      <Footer />
    </main>
  )
}

import { Brain, ShieldCheck, Star, Zap } from "lucide-react"

const features = [
  {
    icon: ShieldCheck,
    title: "You Decide What’s Spam",
    description: "Take control of your inbox. Define exactly what counts as spam—no more relying on Gmail’s black-box filter. Your rules, your call."
  },
  {
    icon: Star,
    title: "Never Miss Important Email",
    description: "Automatically highlight important based solely on rules you define. Never miss an important email again."
  },
  {
    icon: Brain,
    title: "AI-Powered Rules",
    description: "Create custom prompts that intelligently match email content and automatically apply the right labels."
  }
]

export function Features() {
  return (
    <section id="features" className="border-y border-border bg-muted/50 px-4 sm:px-6 py-12 sm:py-24 overflow-x-hidden">
      <div className="mx-auto max-w-6xl w-full">
        <div className="mb-8 sm:mb-16 text-center">
          <h2 className="mb-2 sm:mb-4 text-2xl sm:text-3xl font-bold text-foreground md:text-4xl">
            How It Works
          </h2>
          <p className="mx-auto max-w-2xl text-sm sm:text-base text-muted-foreground">
            Define your rules in a simple Google Sheet, connect your Gmail, and let AI handle the rest.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div 
              key={feature.title}
              className="rounded-lg sm:rounded-xl border border-border bg-card p-4 sm:p-6 transition-shadow hover:shadow-md"
            >
              <div className="mb-3 sm:mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              <h3 className="mb-1.5 sm:mb-2 text-sm sm:text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

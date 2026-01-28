import { Brain, Tag, Zap } from "lucide-react"

const features = [
  {
    icon: Brain,
    title: "AI-Powered Rules",
    description: "Create custom prompts that intelligently match email content and automatically apply the right labels."
  },
  {
    icon: Tag,
    title: "Smart Detection",
    description: "Automatically identify first-time senders, new domains, and contacts you've never emailed before."
  },
  {
    icon: Zap,
    title: "Works Automatically",
    description: "Runs continuously in the background, processing your emails without any manual intervention."
  }
]

export function Features() {
  return (
    <section id="features" className="border-y border-border bg-muted/50 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            How It Works
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Define your rules in a simple Google Sheet, connect your Gmail, and let AI handle the rest.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div 
              key={feature.title}
              className="rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

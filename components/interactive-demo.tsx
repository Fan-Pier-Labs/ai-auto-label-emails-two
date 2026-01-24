"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, X, Sparkles } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Rule {
  id: string
  label: string
  prompt: string
}

interface ClassificationResult {
  labels: string[]
  explanations: Record<string, string>
}

const exampleEmails = [
  {
    subject: "Your Amazon order has shipped",
    body: "Your order #123-456-789 has been shipped and will arrive in 2-3 business days. Track your package here.",
    from: "orders@amazon.com"
  },
  {
    subject: "Weekly Newsletter - Tech Updates",
    body: "This week in tech: AI breakthroughs, new gadgets, and industry news. Unsubscribe at any time by clicking here.",
    from: "newsletter@techblog.com"
  },
  {
    subject: "Meeting tomorrow at 2pm",
    body: "Hi, just confirming our meeting tomorrow at 2pm in conference room B. Let me know if you need to reschedule.",
    from: "colleague@company.com"
  }
]

const exampleRules: Rule[] = [
  { id: "1", label: "Shopping", prompt: "order confirmation or shipping notification" },
  { id: "2", label: "Newsletter", prompt: "newsletter or marketing email with unsubscribe" },
  { id: "3", label: "Meeting", prompt: "meeting invitation or scheduling" },
]

export function InteractiveDemo() {
  const [emailSubject, setEmailSubject] = useState("")
  const [emailBody, setEmailBody] = useState("")
  const [emailFrom, setEmailFrom] = useState("")
  const [rules, setRules] = useState<Rule[]>(exampleRules)
  const [newRuleLabel, setNewRuleLabel] = useState("")
  const [newRulePrompt, setNewRulePrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const addRule = () => {
    if (newRuleLabel && newRulePrompt) {
      setRules([...rules, { id: Date.now().toString(), label: newRuleLabel, prompt: newRulePrompt }])
      setNewRuleLabel("")
      setNewRulePrompt("")
    }
  }

  const removeRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id))
  }

  const loadExample = (index: number) => {
    const example = exampleEmails[index]
    setEmailSubject(example.subject)
    setEmailBody(example.body)
    setEmailFrom(example.from)
    setResult(null)
    setError(null)
  }

  const classifyEmail = async () => {
    if (!emailSubject || !emailBody) {
      setError("Please enter both subject and body")
      return
    }

    if (rules.length === 0) {
      setError("Please add at least one rule")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: {
            subject: emailSubject,
            body: emailBody,
            from: emailFrom || "unknown@example.com",
          },
          rules: rules.map(r => ({ label: r.label, prompt: r.prompt })),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to classify email")
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="demo" className="px-6 py-24 bg-muted/30">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>Try It Live</span>
          </div>
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Interactive Demo
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Test the AI email classifier with your own examples. Add custom rules and see how it works in real-time.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left column - Input */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="mb-4 text-lg font-semibold">Email Content</h3>
              
              <div className="mb-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadExample(0)}
                >
                  Load Example 1
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadExample(1)}
                >
                  Load Example 2
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadExample(2)}
                >
                  Load Example 3
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="from">From</Label>
                  <Input
                    id="from"
                    value={emailFrom}
                    onChange={(e) => setEmailFrom(e.target.value)}
                    placeholder="sender@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Email subject..."
                  />
                </div>
                <div>
                  <Label htmlFor="body">Body</Label>
                  <Textarea
                    id="body"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Email body content..."
                    rows={6}
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="mb-4 text-lg font-semibold">Classification Rules</h3>
              
              <div className="mb-4 space-y-3">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3">
                    <div className="flex-1">
                      <div className="mb-1 font-medium text-sm">{rule.label}</div>
                      <div className="text-xs text-muted-foreground">{rule.prompt}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRule(rule.id)}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <Input
                    value={newRuleLabel}
                    onChange={(e) => setNewRuleLabel(e.target.value)}
                    placeholder="Label name (e.g., Important)"
                  />
                </div>
                <div>
                  <Input
                    value={newRulePrompt}
                    onChange={(e) => setNewRulePrompt(e.target.value)}
                    placeholder="Rule description (e.g., urgent or high priority)"
                  />
                </div>
                <Button onClick={addRule} variant="outline" className="w-full" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Rule
                </Button>
              </div>
            </Card>

            <Button
              onClick={classifyEmail}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Classifying...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Classify Email
                </>
              )}
            </Button>
          </div>

          {/* Right column - Results */}
          <div>
            <Card className="p-6 sticky top-6">
              <h3 className="mb-4 text-lg font-semibold">Results</h3>
              
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {result && (
                <div className="space-y-4">
                  {result.labels.length > 0 ? (
                    <>
                      <div>
                        <p className="mb-3 text-sm text-muted-foreground">
                          Applied Labels:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {result.labels.map((label) => (
                            <Badge key={label} variant="default" className="text-sm">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-border pt-4">
                        <p className="mb-3 text-sm font-medium">Explanations:</p>
                        <div className="space-y-3">
                          {Object.entries(result.explanations).map(([label, explanation]) => (
                            <div key={label} className="rounded-lg bg-muted/50 p-3">
                              <div className="mb-1 font-medium text-sm">{label}</div>
                              <div className="text-xs text-muted-foreground">{explanation}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg bg-muted/50 p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        No labels matched this email
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!result && !error && (
                <div className="flex items-center justify-center rounded-lg bg-muted/50 p-12">
                  <p className="text-sm text-muted-foreground">
                    Results will appear here
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}

"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, X, Sparkles } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"

interface Rule {
  id: string
  label: string
  prompt: string
}

interface ClassificationResult {
  labels: string[]
  explanations: Record<string, string>
}

interface ExampleEmail {
  id: string
  from: string
  fromName: string
  subject: string
  body: string
}

const exampleEmails: ExampleEmail[] = [
  {
    id: "1",
    fromName: "John Doe",
    from: "john.doe@email.com",
    subject: "Software Engineer Position - Application",
    body: `Dear Hiring Manager,

I am writing to express my strong interest in the Software Engineer position that was recently posted. With over 5 years of experience in full-stack development, I believe I would be a great fit for your team.

My background includes:
- Expertise in React, TypeScript, and Node.js
- Experience building scalable web applications
- Strong problem-solving and communication skills

I have attached my resume for your review. I would welcome the opportunity to discuss how my skills and experience align with your needs.

Thank you for your consideration.

Best regards,
John Doe`
  },
  {
    id: "2",
    fromName: "TechProduct Team",
    from: "sales@techproduct.com",
    subject: "Revolutionize Your Workflow with Our New AI Tool",
    body: `Hi there!

Are you tired of spending hours on repetitive tasks? Our new AI-powered automation tool can help you save up to 10 hours per week!

Key features:
✨ Intelligent task automation
✨ Seamless integrations with your favorite tools
✨ 24/7 customer support
✨ 30-day money-back guarantee

Special offer: Get 50% off your first month when you sign up today!

Click here to start your free trial: [link]

Don't miss out on this limited-time offer!

Best,
The TechProduct Team`
  },
  {
    id: "3",
    fromName: "TechBlog Newsletter",
    from: "newsletter@techblog.com",
    subject: "Weekly Tech Digest - AI Breakthroughs & Industry News",
    body: `This week in tech:

🤖 AI Breakthrough: New language model achieves human-level performance
📱 Mobile: Latest smartphone releases and reviews
💻 Development: New frameworks and tools for developers
🚀 Startups: Funding rounds and acquisitions

Read the full articles on our website.

You're receiving this because you subscribed to our newsletter. Unsubscribe here.`
  },
  {
    id: "4",
    fromName: "Sarah Chen",
    from: "sarah.chen@company.com",
    subject: "Q4 Planning Meeting - Next Steps",
    body: `Hi team,

I'd like to schedule a meeting to discuss our Q4 planning and review the roadmap. 

Proposed agenda:
- Review Q3 results
- Discuss Q4 objectives
- Resource allocation
- Timeline and milestones

Please let me know your availability for next week. I'm free Tuesday-Thursday afternoons.

Looking forward to our discussion!

Best,
Sarah`
  }
]

// Initial preset rules (loaded on page load)
const initialPresetRules: Rule[] = [
  { id: "1", label: "Job Application", prompt: "someone is looking for a job, applying for a position, or seeking employment" },
  { id: "2", label: "Product Promotion", prompt: "marketing email promoting a product, service, or special offer" },
  { id: "3", label: "Newsletter", prompt: "newsletter or digest email with multiple articles or updates" },
]

// Simple matching function for default labels (no API call)
const getDefaultLabels = (email: ExampleEmail, rules: Rule[]): ClassificationResult => {
  const labels: string[] = []
  const explanations: Record<string, string> = {}
  const emailContent = `${email.subject} ${email.body}`.toLowerCase()
  
  rules.forEach(rule => {
    if (!rule.label.trim() || !rule.prompt.trim()) return
    
    let matches = false
    
    // Specific matching for each label type
    if (rule.label === "Job Application") {
      // Match job application emails
      const jobKeywords = ["job", "position", "application", "applying", "resume", "cv", "employment", "hiring", "candidate"]
      matches = jobKeywords.some(keyword => emailContent.includes(keyword))
    } else if (rule.label === "Product Promotion") {
      // Match product promotion emails
      const promoKeywords = ["promotion", "promoting", "product", "service", "special offer", "discount", "deal", "trial", "sale", "marketing"]
      matches = promoKeywords.some(keyword => emailContent.includes(keyword))
    } else if (rule.label === "Newsletter") {
      // Match newsletter emails
      const newsletterKeywords = ["newsletter", "digest", "weekly", "updates", "subscribe", "unsubscribe"]
      matches = newsletterKeywords.some(keyword => emailContent.includes(keyword))
    }
    
    if (matches) {
      labels.push(rule.label)
      explanations[rule.label] = `Matches: ${rule.prompt}`
    }
  })
  
  return { labels, explanations }
}

export function InteractiveDemo() {
  const [selectedEmail, setSelectedEmail] = useState<ExampleEmail>(exampleEmails[0])
  const [rules, setRules] = useState<Rule[]>([...initialPresetRules, { id: "new", label: "", prompt: "" }])
  const [loading, setLoading] = useState(false)
  const [emailResults, setEmailResults] = useState<Record<string, ClassificationResult>>(() => {
    // Initialize with default labels based on simple matching
    const defaultResults: Record<string, ClassificationResult> = {}
    exampleEmails.forEach(email => {
      defaultResults[email.id] = getDefaultLabels(email, initialPresetRules)
    })
    return defaultResults
  })
  const [error, setError] = useState<string | null>(null)
  const [hasUserEdited, setHasUserEdited] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const classifyEmail = async (email: ExampleEmail) => {
    // Filter out empty rules
    const validRules = rules.filter(r => r.label.trim() && r.prompt.trim())
    
    if (validRules.length === 0) {
      return
    }

    // Prevent duplicate calls
    if (loading) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: {
            subject: email.subject,
            body: email.body,
            from: email.from,
          },
          rules: validRules.map(r => ({ label: r.label, prompt: r.prompt })),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to classify email")
      }

      setEmailResults(prev => ({
        ...prev,
        [email.id]: data
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  // Auto-classify all emails when rules change (debounced) - only if user has edited
  useEffect(() => {
    if (!hasUserEdited) return
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    const validRules = rules.filter(r => r.label.trim() && r.prompt.trim())
    if (validRules.length > 0) {
      timeoutRef.current = setTimeout(() => {
        exampleEmails.forEach(email => {
          classifyEmail(email)
        })
      }, 500) // 500ms debounce
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, hasUserEdited])

  const updateRule = (id: string, field: "label" | "prompt", value: string) => {
    setHasUserEdited(true)
    const updatedRules = rules.map(r => r.id === id ? { ...r, [field]: value } : r)
    
    // If this is the last row and both fields are now filled, add a new empty row
    const lastRule = updatedRules[updatedRules.length - 1]
    if (lastRule && lastRule.id === id) {
      const oldRule = rules.find(r => r.id === id)
      const wasEmpty = !oldRule?.label.trim() || !oldRule?.prompt.trim()
      const nowFilled = lastRule.label.trim() && lastRule.prompt.trim()
      
      if (wasEmpty && nowFilled) {
        // Add new empty row
        updatedRules.push({ id: `new-${Date.now()}`, label: "", prompt: "" })
      }
    }
    
    setRules(updatedRules)
  }

  const removeRule = (id: string) => {
    setHasUserEdited(true)
    const filtered = rules.filter(r => r.id !== id)
    // Ensure there's always at least one empty row at the end
    const lastRule = filtered[filtered.length - 1]
    if (!lastRule || (lastRule.label.trim() && lastRule.prompt.trim())) {
      filtered.push({ id: `new-${Date.now()}`, label: "", prompt: "" })
    }
    setRules(filtered)
  }

  const truncateText = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + "..."
  }

  const getEmailLabels = (emailId: string): string[] => {
    return emailResults[emailId]?.labels || []
  }

  // Auto-resize textareas on mount and when rules change
  useEffect(() => {
    const textareas = document.querySelectorAll('textarea[placeholder="AI prompt description"]')
    textareas.forEach((textarea) => {
      const el = textarea as HTMLTextAreaElement
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    })
  }, [rules])

  return (
    <section id="demo" className="px-6 py-24 bg-muted/30">
      <div className="w-full max-w-7xl mx-auto">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>Try It Live</span>
          </div>
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Interactive Demo
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Configure labels and select an email to see classification in real-time.
          </p>
        </div>

        <div className="grid gap-8" style={{ gridTemplateColumns: '40% 60%' }}>
          {/* Left Side - Labels Table */}
          <div>
            <Card className="p-6 h-full">
              <h3 className="mb-4 text-lg font-semibold">AI Label Configuration</h3>
              
              {loading && (
                <div className="mb-4 flex items-center justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}

              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="rounded-lg border border-border overflow-hidden w-full">
                <Table>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="p-2 w-[140px]">
                          <Input
                            value={rule.label}
                            onChange={(e) => updateRule(rule.id, "label", e.target.value)}
                            placeholder="Label name"
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <Textarea
                            value={rule.prompt}
                            onChange={(e) => {
                              updateRule(rule.id, "prompt", e.target.value)
                              // Auto-resize textarea
                              e.target.style.height = 'auto'
                              e.target.style.height = `${e.target.scrollHeight}px`
                            }}
                            placeholder="AI prompt description"
                            className="min-h-[32px] text-sm resize-none overflow-hidden"
                            rows={1}
                            style={{ height: 'auto' }}
                          />
                        </TableCell>
                        <TableCell className="p-2 w-[50px]">
                          {rule.label.trim() || rule.prompt.trim() ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeRule(rule.id)}
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          {/* Right Side - Gmail-style Email List */}
          <div>
            <Card className="p-6">
              <h3 className="mb-4 text-lg font-semibold">Example Emails</h3>
              
              <div className="space-y-0 divide-y divide-border">
                {exampleEmails.map((email) => {
                  const labels = getEmailLabels(email.id)
                  const isSelected = selectedEmail?.id === email.id
                  
                  return (
                    <div
                      key={email.id}
                      className={`cursor-pointer p-3 transition-colors hover:bg-muted/50 ${
                        isSelected ? "bg-primary/10 border-l-4 border-l-primary" : ""
                      }`}
                      onClick={() => setSelectedEmail(email)}
                    >
                      <div className="flex items-center text-sm whitespace-nowrap">
                        <span className="text-foreground w-[140px] flex-shrink-0">{email.fromName}</span>
                        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden" style={{ paddingLeft: '1rem' }}>
                          {/* Labels to the left of subject */}
                          {labels.length > 0 && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {labels.map((label) => (
                                <Badge 
                                  key={label} 
                                  variant="secondary" 
                                  className="text-xs px-1.5 py-0 h-5"
                                >
                                  {label}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {/* Subject - always at consistent position */}
                          <span className="font-semibold flex-shrink-0">
                            {email.subject}
                          </span>
                          {/* Email preview */}
                          <span className="text-muted-foreground truncate ml-2">
                            {truncateText(email.body, 60)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}

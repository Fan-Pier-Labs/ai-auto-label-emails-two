"use client"

import { useState, useEffect, useRef } from "react"
import { withRetry, isRetryableHttpError } from "@/lib/retry"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Trash2, Sparkles, Plus, Pencil } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/hooks/use-toast"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DETERMINISTIC_RULE_NAMES,
  type DeterministicRuleName,
} from "@/lib/types"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

/** Groups of deterministic rules for accordion UI */
const DETERMINISTIC_RULE_GROUPS: { title: string; rules: readonly DeterministicRuleName[] }[] = [
  { title: "First-time sender", rules: ["first-domain", "first-address"] },
  { title: "Invalid or missing sender", rules: ["no-email-domain", "no-email-address"] },
  { title: "Domain status", rules: ["domain-down", "domain-redirects", "new-domain", "domain-resolves-known-provider"] },
  { title: "SMTP provider", rules: ["smtp-gmail", "smtp-msft", "smtp-automation", "smtp-work-email", "smtp-other"] },
  { title: "DNS & authentication", rules: ["no-spf", "no-dmarc", "has-dkim", "no-txt"] },
]

/** Human-readable label for deterministic rule names */
function formatDeterministicRuleName(name: string): string {
  const acronyms: Record<string, string> = {
    smtp: "SMTP",
    spf: "SPF",
    dmarc: "DMARC",
    dkim: "DKIM",
    txt: "TXT",
    mx: "MX",
  }
  return name
    .split("-")
    .map(part => acronyms[part.toLowerCase()] ?? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

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
  },
  {
    id: "5",
    fromName: "Support",
    from: "support@helpdesk.io",
    subject: "Ticket #7842 – Your request has been resolved",
    body: `Hello,

Your support ticket #7842 has been resolved.

Summary: Password reset and 2FA setup completed successfully.

If you have any further questions, reply to this email or open a new ticket.

Thank you for contacting us.

Customer Support
helpdesk.io`
  },
  {
    id: "6",
    fromName: "Billing",
    from: "billing@payments.example.com",
    subject: "Invoice INV-2024-0892 – Payment received",
    body: `Dear Customer,

We have received your payment of $149.00 for Invoice INV-2024-0892.

Payment method: Credit card ending in 4242
Date: January 28, 2025

You can download your receipt and invoice from the billing portal. If you have any questions about this invoice, contact our billing team.

Thank you for your business.

Billing Department`
  },
  {
    id: "7",
    fromName: "Notifications",
    from: "notifications@socialapp.com",
    subject: "Alex commented on your post",
    body: `Hi,

Alex Johnson commented on your post: "Great point! I'd add that we should also consider the timeline."

View the conversation and reply here: [link]

You can manage notification preferences in your account settings.

— The SocialApp Team`
  },
  {
    id: "8",
    fromName: "Mike Wilson",
    from: "mike.wilson@gmail.com",
    subject: "Re: Weekend plans?",
    body: `Hey!

Just checking in – are we still on for Saturday? I was thinking we could do the hike in the morning and then grab lunch downtown.

Let me know what works for you.

Mike`
  },
  {
    id: "9",
    fromName: "Account Security",
    from: "noreply@secure-login.xyz",
    subject: "Urgent: Verify your account now",
    body: `Your account has been flagged for unusual activity. Verify your identity immediately to avoid suspension.

Click here to verify: [link]

This is an automated message. Do not reply.`
  },
  {
    id: "10",
    fromName: "HR Team",
    from: "hr@company.com",
    subject: "Open enrollment – benefits and 401(k)",
    body: `Hello everyone,

Open enrollment for benefits and 401(k) runs from February 1–15.

Please review the attached guide and submit your elections in the HR portal by the deadline. If you have questions, join our drop-in sessions on Feb 5 and 12.

Best,
Human Resources`
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

async function fetchClassifyResult(
  email: ExampleEmail,
  validRules: Rule[]
): Promise<ClassificationResult> {
  const response = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: { subject: email.subject, body: email.body, from: email.from },
      rules: validRules.map(r => ({ label: r.label, prompt: r.prompt })),
    }),
  })
  const data = await response.json()
  if (!response.ok) {
    const err = new Error(data.error || "Failed to classify email") as Error & { status?: number }
    err.status = response.status
    throw err
  }
  return data
}

export function InteractiveDemo() {
  const [selectedEmail, setSelectedEmail] = useState<ExampleEmail>(exampleEmails[0])
  const [rules, setRules] = useState<Rule[]>([...initialPresetRules])
  const [loading, setLoading] = useState(false)
  const [emailResults, setEmailResults] = useState<Record<string, ClassificationResult>>(() => {
    // Initialize with default labels based on simple matching
    const defaultResults: Record<string, ClassificationResult> = {}
    exampleEmails.forEach(email => {
      defaultResults[email.id] = getDefaultLabels(email, initialPresetRules)
    })
    return defaultResults
  })
  const [hasUserEdited, setHasUserEdited] = useState(false)
  const [showLabelForm, setShowLabelForm] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [formLabel, setFormLabel] = useState("")
  const [formPrompt, setFormPrompt] = useState("")
  const [enabledDeterministicRules, setEnabledDeterministicRules] = useState<Record<string, boolean>>(
    () => Object.fromEntries(DETERMINISTIC_RULE_NAMES.map(n => [n, false]))
  )
  const [deterministicLabelsByFrom, setDeterministicLabelsByFrom] = useState<Record<string, string[]>>({})
  const [deterministicLoading, setDeterministicLoading] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const savedRules = rules.filter(r => r.label.trim() && r.prompt.trim())
  const isFormOpen = showLabelForm || editingRuleId !== null

  const classifyEmail = async (email: ExampleEmail) => {
    // Filter out empty rules
    const validRules = rules.filter(r => r.label.trim() && r.prompt.trim())
    
    if (validRules.length === 0) {
      return
    }

    // Prevent duplicate calls
    if (loading) return

    setLoading(true)

    try {
      const data = await withRetry(
        () => fetchClassifyResult(email, validRules),
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          isRetryable: isRetryableHttpError,
        }
      )
      setEmailResults(prev => ({
        ...prev,
        [email.id]: data
      }))
    } catch {
      toast({
        title: "Something went wrong",
        variant: "destructive",
      })
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
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const removeRule = (id: string) => {
    setHasUserEdited(true)
    setRules(prev => prev.filter(r => r.id !== id))
  }

  const openAddForm = () => {
    setShowLabelForm(true)
    setEditingRuleId(null)
    setFormLabel("")
    setFormPrompt("")
  }

  const openEditForm = (rule: Rule) => {
    setEditingRuleId(rule.id)
    setShowLabelForm(false)
    setFormLabel(rule.label)
    setFormPrompt(rule.prompt)
  }

  const closeForm = () => {
    setShowLabelForm(false)
    setEditingRuleId(null)
    setFormLabel("")
    setFormPrompt("")
  }

  const saveForm = () => {
    const label = formLabel.trim()
    const prompt = formPrompt.trim()
    if (!label || !prompt) return
    if (editingRuleId) {
      setRules(prev => prev.map(r =>
        r.id === editingRuleId ? { ...r, label, prompt } : r
      ))
    } else {
      setRules(prev => [...prev, { id: `new-${Date.now()}`, label, prompt }])
    }
    setHasUserEdited(true)
    closeForm()
  }

  const truncateText = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + "..."
  }

  const getEmailLabels = (emailId: string): string[] => {
    return emailResults[emailId]?.labels || []
  }

  const getDeterministicLabels = (from: string): string[] => {
    return deterministicLabelsByFrom[from] ?? []
  }

  const fetchDeterministicLabels = async () => {
    setDeterministicLoading(true)
    try {
      const response = await fetch("/api/deterministic-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: exampleEmails.map(e => ({ id: e.id, from: e.from })),
          enabledRules: enabledDeterministicRules,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Failed to fetch deterministic labels")
      const results = (data.results ?? {}) as Record<string, { labels: string[] }>
      setDeterministicLabelsByFrom(
        Object.fromEntries(
          Object.entries(results).map(([from, r]) => [from, r.labels ?? []])
        )
      )
    } catch {
      toast({
        title: "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setDeterministicLoading(false)
    }
  }

  useEffect(() => {
    fetchDeterministicLabels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledDeterministicRules])

  const setDeterministicRuleEnabled = (ruleName: string, checked: boolean) => {
    setEnabledDeterministicRules(prev => ({ ...prev, [ruleName]: checked }))
  }


  // Auto-resize form textarea when form is open or rules change
  useEffect(() => {
    const textareas = document.querySelectorAll('textarea[placeholder="Enter label prompt"]')
    textareas.forEach((textarea) => {
      const el = textarea as HTMLTextAreaElement
      el.style.height = "auto"
      el.style.height = `${el.scrollHeight}px`
    })
  }, [rules, isFormOpen])

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

        <div className="grid items-stretch gap-8" style={{ gridTemplateColumns: "30% 70%" }}>
          {/* Left Side - Labels sidebar */}
          <div className="min-h-0 min-w-0">
            <Card className="p-6 h-full min-w-0 overflow-x-hidden">
              {/* Labels section */}
              <div className="mb-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <h3 className="text-lg font-semibold"> AI Labels</h3>
                  </div>
                  {!isFormOpen && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={openAddForm}
                      className="h-8 w-8"
                      aria-label="Add label"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {isFormOpen ? (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <Input
                      value={formLabel}
                      onChange={(e) => setFormLabel(e.target.value)}
                      placeholder="Enter label name"
                      className="h-8 text-sm"
                    />
                    <Textarea
                      value={formPrompt}
                      onChange={(e) => {
                        setFormPrompt(e.target.value)
                        e.target.style.height = "auto"
                        e.target.style.height = `${e.target.scrollHeight}px`
                      }}
                      placeholder="Enter label prompt"
                      className="min-h-[32px] text-sm resize-none overflow-hidden"
                      rows={2}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={closeForm}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveForm}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {savedRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between gap-2 p-2"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground cursor-default">
                              {rule.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" align="center" className="max-w-xs">
                            {rule.prompt}
                          </TooltipContent>
                        </Tooltip>
                        <div className="flex shrink-0 items-center gap-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditForm(rule)}
                            className="h-8 w-8"
                            aria-label="Edit label"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRule(rule.id)}
                            className="h-8 w-8"
                            aria-label="Delete label"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Deterministic rules section */}
              <div className="border-t border-border pt-4 min-w-0 overflow-x-hidden">
                <h3 className="mb-3 text-lg font-semibold">Rules</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Expand a group to enable rules.
                </p>
                <Accordion type="multiple" className="rules-list-thin-scrollbar max-h-64 overflow-x-hidden overflow-y-auto">
                  {DETERMINISTIC_RULE_GROUPS.map((group) => (
                    <AccordionItem key={group.title} value={group.title} className="border-none min-w-0">
                      <AccordionTrigger className="py-2 text-sm font-medium hover:no-underline [&>span]:min-w-0 [&>span]:truncate">
                        {group.title}
                      </AccordionTrigger>
                      <AccordionContent className="pb-2 pt-0">
                        <div className="space-y-2 min-w-0">
                          {group.rules.map((ruleName) => (
                            <label
                              key={ruleName}
                              className="flex cursor-pointer items-center gap-2 text-sm min-w-0"
                            >
                              <Checkbox
                                checked={enabledDeterministicRules[ruleName] ?? false}
                                onCheckedChange={(checked) =>
                                  setDeterministicRuleEnabled(ruleName, checked === true)
                                }
                                className="shrink-0"
                              />
                              <span className="min-w-0 truncate">{formatDeterministicRuleName(ruleName)}</span>
                            </label>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </Card>
          </div>

          {/* Right Side - Gmail-style Email List */}
          <div className="min-h-0">
            <Card className="p-6 h-full">
              <h3 className="mb-4 text-lg font-semibold">Inbox</h3>
              
              <div className="space-y-0 divide-y divide-border">
                {exampleEmails.map((email) => {
                  const aiLabels = getEmailLabels(email.id)
                  const detLabels = getDeterministicLabels(email.from)
                  const labels = [...aiLabels, ...detLabels]
                  const isSelected = selectedEmail?.id === email.id
                  
                  return (
                    <div
                      key={email.id}
                      className={`cursor-pointer p-3 transition-colors hover:bg-muted/50 ${
                        isSelected ? "bg-primary/10 border-l-4 border-l-primary" : ""
                      }`}
                      onClick={() => setSelectedEmail(email)}
                    >
                      <div
                        className={`flex items-center text-sm whitespace-nowrap ${
                          loading || deterministicLoading
                            ? "animate-pulse text-muted-foreground/70"
                            : ""
                        }`}
                      >
                        <span className="text-foreground w-[140px] flex-shrink-0">
                          {email.fromName}
                        </span>
                        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden" style={{ paddingLeft: "1rem" }}>
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
                          <span className="font-semibold flex-shrink-0">
                            {email.subject}
                          </span>
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

"use client"

import { useState, useEffect, useRef } from "react"
import { withRetry, isRetryableHttpError } from "@/lib/retry"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Trash2, Sparkles, Plus, Pencil, PartyPopper } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/hooks/use-toast"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { exampleEmails, wildEmails, type ExampleEmail } from "@/lib/demo-emails"
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
  const [emails, setEmails] = useState<ExampleEmail[]>(() => [...exampleEmails])
  const [selectedEmail, setSelectedEmail] = useState<ExampleEmail>(exampleEmails[0])
  const [rules, setRules] = useState<Rule[]>([...initialPresetRules])
  const [loading, setLoading] = useState(false)
  const [emailResults, setEmailResults] = useState<Record<string, ClassificationResult>>(() => {
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
        emails.forEach(email => {
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
  }, [rules, hasUserEdited, emails])

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

  /** Compute deterministic labels for an email based on enabled rules */
  const getDeterministicLabels = (email: ExampleEmail): string[] => {
    if (!email.deterministicLabels) return []
    return email.deterministicLabels.filter(rule => enabledDeterministicRules[rule])
  }

  /** Display text for a label (AI labels as-is, deterministic rules formatted) */
  const getLabelDisplayName = (label: string): string => {
    if ((DETERMINISTIC_RULE_NAMES as readonly string[]).includes(label)) {
      return formatDeterministicRuleName(label)
    }
    return label
  }

  const setDeterministicRuleEnabled = (ruleName: string, checked: boolean) => {
    setEnabledDeterministicRules(prev => ({ ...prev, [ruleName]: checked }))
  }

  const hasWildEmails = emails.some(e => e.id.startsWith("wild-"))

  const addWildEmails = () => {
    const ts = Date.now()
    const newEmails: ExampleEmail[] = wildEmails.map((e, i) => ({
      ...e,
      id: `wild-${ts}-${i}`,
    }))
    setEmails(prev => [...newEmails, ...prev])
    setEmailResults(prev => {
      const next = { ...prev }
      const validRules = rules.filter(r => r.label.trim() && r.prompt.trim())
      newEmails.forEach(email => {
        next[email.id] = getDefaultLabels(email, validRules)
      })
      return next
    })
  }

  const removeWildEmails = () => {
    const remaining = emails.filter(e => !e.id.startsWith("wild-"))
    const wildIds = new Set(emails.filter(e => e.id.startsWith("wild-")).map(e => e.id))
    setEmails(remaining)
    setEmailResults(prev => {
      const next = { ...prev }
      wildIds.forEach(id => delete next[id])
      return next
    })
    if (selectedEmail && wildIds.has(selectedEmail.id) && remaining.length > 0) {
      setSelectedEmail(remaining[0])
    }
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
    <section id="demo" className="px-4 sm:px-6 py-8 sm:py-24 bg-muted/30 overflow-hidden max-w-[100vw]">
      <div className="w-full max-w-7xl mx-auto overflow-hidden box-border">
        <div className="mb-6 sm:mb-12 text-center">
          <div className="mb-3 sm:mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>Try It Live</span>
          </div>
          <h2 className="mb-2 sm:mb-4 text-2xl sm:text-3xl font-bold text-foreground md:text-4xl">
            Interactive Demo
          </h2>
          <p className="mx-auto max-w-2xl text-sm sm:text-base text-muted-foreground">
            Configure labels and select an email to see classification in real-time.
          </p>
        </div>

        <div className="grid gap-4 lg:gap-8 lg:grid-cols-[3fr_7fr] lg:h-[520px] w-full max-w-full overflow-hidden">
          {/* Left Side - Labels sidebar */}
          <div className="min-h-0 min-w-0 w-full max-w-full flex flex-col h-auto lg:h-full overflow-hidden box-border">
            <Card className="p-3 sm:p-6 min-w-0 w-full max-w-full overflow-hidden min-h-0 flex-1 flex flex-col max-h-[320px] sm:max-h-[400px] lg:max-h-none lg:h-full box-border">
              {/* Labels section */}
              <div className="mb-2 sm:mb-4 shrink-0 w-full overflow-hidden">
                <div className="mb-2 sm:mb-4 flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <h3 className="text-sm sm:text-lg font-semibold truncate">AI Labels</h3>
                  </div>
                  {!isFormOpen && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={openAddForm}
                      className="h-8 w-8 cursor-pointer shrink-0"
                      aria-label="Add label"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {isFormOpen ? (
                  <div className="space-y-2 sm:space-y-3 rounded-lg border border-border p-2 sm:p-3 w-full">
                    <Input
                      value={formLabel}
                      onChange={(e) => setFormLabel(e.target.value)}
                      placeholder="Enter label name"
                      className="h-7 sm:h-8 text-xs sm:text-sm w-full"
                    />
                    <Textarea
                      value={formPrompt}
                      onChange={(e) => {
                        setFormPrompt(e.target.value)
                        e.target.style.height = "auto"
                        e.target.style.height = `${e.target.scrollHeight}px`
                      }}
                      placeholder="Enter label prompt"
                      className="min-h-[28px] sm:min-h-[32px] text-xs sm:text-sm resize-none overflow-hidden w-full"
                      rows={2}
                    />
                    <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                      <Button variant="outline" size="sm" onClick={closeForm} className="cursor-pointer h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3">
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveForm} className="cursor-pointer h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3">
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-32 sm:max-h-48 overflow-y-auto overflow-x-hidden scrollbar-hide w-full" data-demo-scroll>
                    <div className="divide-y divide-border w-full">
                      {savedRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between gap-1 sm:gap-2 py-1 sm:p-2 w-full"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="min-w-0 flex-1 truncate text-xs sm:text-sm text-foreground cursor-default">
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
                              className="h-6 w-6 sm:h-8 sm:w-8 cursor-pointer"
                              aria-label="Edit label"
                            >
                              <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRule(rule.id)}
                              className="h-6 w-6 sm:h-8 sm:w-8 cursor-pointer"
                              aria-label="Delete label"
                            >
                              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Deterministic rules section */}
              <div className="border-t border-border pt-2 sm:pt-4 min-w-0 w-full flex flex-col flex-1 min-h-0 overflow-hidden">
                <h3 className="mb-1.5 sm:mb-3 text-sm sm:text-lg font-semibold shrink-0">Rules</h3>
                <p className="mb-1.5 sm:mb-3 text-xs text-muted-foreground shrink-0">
                  Expand a group to enable rules.
                </p>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide w-full" data-demo-scroll>
                  <Accordion type="single" collapsible className="w-full">
                    {DETERMINISTIC_RULE_GROUPS.map((group) => (
                      <AccordionItem key={group.title} value={group.title} className="border-none min-w-0 w-full">
                        <AccordionTrigger className="py-1.5 sm:py-2 text-xs sm:text-sm font-medium hover:no-underline [&>span]:min-w-0 [&>span]:truncate cursor-pointer w-full">
                          {group.title}
                        </AccordionTrigger>
                        <AccordionContent className="pb-1.5 sm:pb-2 pt-0">
                          <div className="space-y-1.5 sm:space-y-2 min-w-0 w-full">
                            {group.rules.map((ruleName) => (
                              <label
                                key={ruleName}
                                className="flex cursor-pointer items-center gap-1.5 sm:gap-2 text-xs sm:text-sm min-w-0 w-full"
                              >
                                <Checkbox
                                  checked={enabledDeterministicRules[ruleName] ?? false}
                                  onCheckedChange={(checked) =>
                                    setDeterministicRuleEnabled(ruleName, checked === true)
                                  }
                                  className="shrink-0 h-3.5 w-3.5 sm:h-4 sm:w-4"
                                />
                                <span className="min-w-0 truncate flex-1">{formatDeterministicRuleName(ruleName)}</span>
                              </label>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Side - Gmail-style Email List */}
          <div className="min-h-0 min-w-0 w-full max-w-full flex flex-col h-auto lg:h-full overflow-hidden box-border">
            <Card className="p-3 sm:p-6 w-full max-w-full flex flex-col min-h-0 h-[400px] sm:h-[450px] lg:h-full overflow-hidden box-border">
              <div className="mb-2 sm:mb-4 flex items-center justify-between gap-2">
                <h3 className="text-sm sm:text-lg font-semibold shrink-0">Inbox</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={hasWildEmails ? removeWildEmails : addWildEmails}
                  className="gap-1 sm:gap-1.5 cursor-pointer text-[10px] sm:text-sm h-7 sm:h-8 px-2 sm:px-3 shrink-0"
                >
                  {hasWildEmails ? (
                    <>
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>Remove fun</span>
                    </>
                  ) : (
                    <>
                      <PartyPopper className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>Add wild emails</span>
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-0 divide-y divide-border flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide w-full" data-demo-scroll>
                {emails.map((email) => {
                    const aiLabels = getEmailLabels(email.id)
                    const detLabels = getDeterministicLabels(email)
                    const labels = [...aiLabels, ...detLabels]
                    const isSelected = selectedEmail?.id === email.id

                    return (
                      <div
                        key={email.id}
                        className={`cursor-pointer py-1.5 px-2 sm:p-3 transition-colors hover:bg-muted/50 w-full overflow-hidden ${
                          isSelected ? "bg-primary/10 border-l-4 border-l-primary" : ""
                        }`}
                        onClick={() => setSelectedEmail(email)}
                      >
                        {/* Mobile layout - compact */}
                        <div className="sm:hidden w-full overflow-hidden">
                          <div className="flex items-center justify-between gap-2 w-full mb-0.5">
                            <span className="text-xs font-medium text-foreground truncate min-w-0">
                              {email.fromName}
                            </span>
                            {labels.length > 0 && (
                              <div className="flex items-center gap-1 shrink-0">
                                {labels.slice(0, 2).map((label) => (
                                  <Badge
                                    key={label}
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 h-4 whitespace-nowrap"
                                  >
                                    {getLabelDisplayName(label)}
                                  </Badge>
                                ))}
                                {labels.length > 2 && (
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 shrink-0">
                                    +{labels.length - 2}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-foreground truncate w-full">
                            {email.subject}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate w-full">
                            {truncateText(email.body, 60)}
                          </div>
                        </div>
                        {/* Desktop layout - horizontal */}
                        <div className="hidden sm:flex items-center text-sm whitespace-nowrap w-full overflow-hidden">
                          <span className="text-foreground w-[140px] flex-shrink-0 truncate">
                            {email.fromName}
                          </span>
                          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden pl-4">
                            {labels.length > 0 && (
                              <div className="flex items-center gap-1 flex-shrink-0 max-w-[40%] overflow-hidden">
                                {labels.slice(0, 3).map((label) => (
                                  <Badge
                                    key={label}
                                    variant="secondary"
                                    className="text-xs px-1.5 py-0 h-5 truncate max-w-[120px]"
                                  >
                                    {getLabelDisplayName(label)}
                                  </Badge>
                                ))}
                                {labels.length > 3 && (
                                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                                    +{labels.length - 3}
                                  </Badge>
                                )}
                              </div>
                            )}
                            <span className="font-semibold truncate flex-shrink min-w-0">
                              {email.subject}
                            </span>
                            <span className="text-muted-foreground truncate ml-2 min-w-0">
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

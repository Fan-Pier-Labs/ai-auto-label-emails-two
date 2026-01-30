import { NextRequest, NextResponse } from "next/server"
import type { Email, DeterministicRuleName } from "@/lib/types"
import { DETERMINISTIC_RULE_NAMES, DEFAULT_DETERMINISTIC_RULES } from "@/lib/types"
import { applyDeterministicLabels } from "@/lib/deterministic"

export interface DeterministicDemoRequest {
  emails: Array<{ id?: string; from: string }>
  enabledRules?: Record<string, boolean>
}

export interface DeterministicDemoResponse {
  results: Record<string, { labels: string[] }>
}

function buildEmail(from: string, id: string): Email {
  const fromAddress = from.trim()
  const fromDomain = fromAddress.includes("@") ? fromAddress.split("@")[1] ?? "" : ""
  return {
    id,
    threadId: id,
    from: fromAddress,
    fromAddress,
    fromDomain,
    to: [],
    toAddresses: [],
    toDomains: [],
    subject: "",
    body: "",
    snippet: "",
    receivedDate: new Date(),
    labels: [],
  }
}

function normalizeEnabledRules(
  enabledRules?: Record<string, boolean>
): Record<DeterministicRuleName, boolean> {
  const out = { ...DEFAULT_DETERMINISTIC_RULES }
  if (!enabledRules) return out
  for (const name of DETERMINISTIC_RULE_NAMES) {
    if (name in enabledRules) {
      out[name] = Boolean(enabledRules[name])
    }
  }
  return out
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DeterministicDemoRequest
    const { emails: inputEmails, enabledRules } = body

    if (!inputEmails || !Array.isArray(inputEmails) || inputEmails.length === 0) {
      return NextResponse.json(
        { error: "emails array is required and must not be empty" },
        { status: 400 }
      )
    }

    const enabled = normalizeEnabledRules(enabledRules)
    const results: Record<string, { labels: string[] }> = {}

    for (let i = 0; i < inputEmails.length; i++) {
      const { from, id } = inputEmails[i]
      const emailId = id ?? `demo-${i}`
      const email = buildEmail(from, emailId)
      const { labels } = await applyDeterministicLabels(email, enabled, {
        skipHistoryRules: true,
      })
      results[from] = { labels }
    }

    return NextResponse.json({ results } as DeterministicDemoResponse)
  } catch (error) {
    console.error("Deterministic demo error:", error)
    return NextResponse.json(
      { error: "Failed to run deterministic rules" },
      { status: 500 }
    )
  }
}

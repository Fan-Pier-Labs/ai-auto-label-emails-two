# Ryan Rules – Email Processing Flow

Flow for `processEmailWithRyanRules()` in `scripts/run-ryan-rules.ts`.  
Each rule can **apply labels** and **stop** (return), or **continue** to the next step.

---

## Mermaid flowchart

```mermaid
flowchart TD
    Start([Fetch email + headers]) --> R1{Rule 1: Ever emailed<br/>sender or domain?}
    R1 -->|Yes| L1[Add: ai important · STOP]
    R1 -->|No| R2{Rule 2: Same thread as<br/>someone I emailed?}
    R2 -->|Yes| L2[Add: ai important · STOP]
    R2 -->|No| R3a{Rule 3: From<br/>@docs.google.com?}
    R3a -->|Yes| L3a[Add: ai important · STOP]
    R3a -->|No| R3b{Rule 3: Matches Gmail<br/>mark important filter?}
    R3b -->|Yes| L3b[Add: ai important · STOP]
    R3b -->|No| R4a{Rule 4: From known<br/>job portal?}
    R4a -->|Yes| L4a[Add: ai job applicant · STOP]
    R4a -->|No| R4b{Rule 4: Gemini<br/>job applicant?}
    R4b -->|Yes| L4b[Add: ai job applicant · STOP]
    R4b -->|No| Infra[Detect sender infra:<br/>client IP WHOIS → MX → From domain → Received]
    Infra --> InfraType{Sender infra?}
    InfraType -->|gmail_msft| Gmail[Run 5 checks:<br/>domain age, up, reply-to, redirect]
    Gmail --> G1{1 fail? → ai might be spam<br/>2+ fail? → ai not important + ai thinks spam}
    G1 --> Event
    InfraType -->|aws_ses_sendgrid| SES{Gemini: cold email<br/>targeted at Ryan?}
    SES -->|Yes| SESL[Add: ai detected cold email · STOP]
    SES -->|No| Event
    InfraType -->|other| Other[Add: unknown sender mail system]
    Other --> Event
    Event[Event rules: Gemini for<br/>online event, poker night, NYC event, brand event]
    Event --> Imp[Event importance:<br/>online-only → ai not important<br/>NYC/poker/brand → ai important]
    Imp --> Apply[Apply all labels · Return]
```

---

## Simplified linear outline

| Step | Rule / block | Condition | Action | Stop? |
|------|----------------|-----------|--------|-------|
| 1 | Rule 1 | Ever emailed sender or their domain? | Add **ai important** | Yes |
| 2 | Rule 2 | Same thread as someone I’ve emailed? | Add **ai important** | Yes |
| 3 | Rule 3 | From @docs.google.com? | Add **ai important** | Yes |
| 3 | Rule 3 | Matches a Gmail filter that marks as important? | Add **ai important** | Yes |
| 4 | Rule 4 | From known job portal (e.g. symplicity.com)? | Add **ai job applicant** | Yes |
| 4 | Rule 4 | Gemini: job applicant? | Add **ai job applicant** | Yes |
| 5 | Sender infra | Detect via: client IP WHOIS → MX → From domain → Received | — | No |
| 6 | gmail_msft | 5 checks (domain age &lt;2mo, domain up, reply-to ≠ from, redirect) | 1 fail → **ai might be spam**; 2+ fail → **ai not important** + **ai thinks spam** | No |
| 6 | aws_ses_sendgrid | Gemini: cold email targeted at Ryan? | Add **ai detected cold email** | Yes |
| 6 | other | — | Add **unknown sender mail system** | No |
| 7 | Event rules | Gemini: online event, poker night, NYC event, brand event | Add matching event labels | No |
| 8 | Event importance | online event only | Add **ai not important** | No |
| 8 | Event importance | NYC / poker / brand event | Add **ai important** | No |
| 9 | — | — | Apply all collected labels | — |

---

## Sender infra detection order

1. **Client IP** from headers (e.g. `client-ip=` in Received-SPF / Authentication-Results) → WHOIS IP → map OrgName/NetName to gmail_msft / aws_ses_sendgrid.
2. **MX lookup** on From domain → `categorizeSMTPProvider` → gmail/msft → gmail_msft, automation → aws_ses_sendgrid.
3. **From domain** in known list (amazonses.com, sendgrid.net, mailgun.org, mailgun.com) → aws_ses_sendgrid.
4. **First Received** header “from” clause patterns → gmail_msft or aws_ses_sendgrid.
5. Otherwise → **other**.

---

*Generated from `scripts/run-ryan-rules.ts`.*

import type { DeterministicRuleName } from "@/lib/types"

/** Example email shape for the interactive demo */
export interface ExampleEmail {
  id: string
  from: string
  fromName: string
  subject: string
  body: string
  /** Static deterministic rules that apply to this email (for demo purposes) */
  deterministicLabels?: DeterministicRuleName[]
}

/** Default example emails shown in the demo inbox */
export const exampleEmails: ExampleEmail[] = [
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
John Doe`,
    deterministicLabels: ["first-address", "smtp-other"],
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
The TechProduct Team`,
    deterministicLabels: ["smtp-automation", "first-domain"],
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

You're receiving this because you subscribed to our newsletter. Unsubscribe here.`,
    deterministicLabels: ["smtp-automation", "first-domain"],
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
Sarah`,
    deterministicLabels: ["smtp-work-email"],
  },
  // Rule-demo emails (visible early so domain-down, redirects, smtp-msft, has-dkim, no-txt can be tested without scrolling)
  {
    id: "11",
    fromName: "Jane Smith",
    from: "jane.smith@outlook.com",
    subject: "Re: Project timeline – next steps",
    body: `Hi,

Thanks for sending the draft. I've reviewed it and added a few comments. Can we sync tomorrow to align on the timeline?

Best,
Jane`,
    deterministicLabels: ["smtp-msft", "first-address"],
  },
  {
    id: "12",
    fromName: "Support",
    from: "support@defunct-startup-2020.io",
    subject: "Your account will be archived",
    body: `We are winding down our service. Please export your data before the end of the month. After that, our servers will be shut down.

If you have questions, reply to this email (we may not respond – our domain is down).

— The Team`,
    deterministicLabels: ["domain-down", "first-domain", "no-spf", "no-dmarc"],
  },
  {
    id: "13",
    fromName: "Security Notice",
    from: "security@paypal-verify.xyz",
    subject: "Action required: verify your account",
    body: `We noticed unusual activity. Please confirm your identity by clicking the link below. This is a one-time verification.

[Verify now]

If you did not request this, ignore this message.`,
    deterministicLabels: ["domain-redirects", "new-domain", "no-spf", "no-dmarc", "first-domain"],
  },
  {
    id: "14",
    fromName: "Marketing",
    from: "marketing@brand.com",
    subject: "New product launch – early access",
    body: `You're invited to early access for our new product. We use industry-standard authentication (SPF, DKIM, DMARC) for all our emails.

Reply or visit our site to opt in.

— Marketing Team`,
    deterministicLabels: ["has-dkim", "smtp-automation", "first-domain"],
  },
  {
    id: "15",
    fromName: "Alerts",
    from: "alerts@crypto-wallet.xyz",
    subject: "Your withdrawal is pending",
    body: `A withdrawal request is pending. Confirm within 24 hours or it will be cancelled.

Log in to your account to approve. Do not share your credentials.`,
    deterministicLabels: ["no-txt", "new-domain", "first-domain"],
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
helpdesk.io`,
    deterministicLabels: ["smtp-automation", "first-domain"],
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

Billing Department`,
    deterministicLabels: ["smtp-automation"],
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

— The SocialApp Team`,
    deterministicLabels: ["smtp-automation", "first-domain"],
  },
  {
    id: "8",
    fromName: "Mike Wilson",
    from: "mike.wilson@gmail.com",
    subject: "Re: Weekend plans?",
    body: `Hey!

Just checking in – are we still on for Saturday? I was thinking we could do the hike in the morning and then grab lunch downtown.

Let me know what works for you.

Mike`,
    deterministicLabels: ["smtp-gmail", "first-address"],
  },
  {
    id: "9",
    fromName: "Account Security",
    from: "noreply@secure-login.xyz",
    subject: "Urgent: Verify your account now",
    body: `Your account has been flagged for unusual activity. Verify your identity immediately to avoid suspension.

Click here to verify: [link]

This is an automated message. Do not reply.`,
    deterministicLabels: ["new-domain", "no-spf", "no-dmarc", "first-domain"],
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
Human Resources`,
    deterministicLabels: ["smtp-work-email"],
  },
  {
    id: "16",
    fromName: "Unknown",
    from: "",
    subject: "Message from contact form",
    body: `No reply-to address was provided. The sender did not include a valid email address or domain.

Message: Please call me back about the proposal.`,
    deterministicLabels: ["no-email-domain", "no-email-address"],
  },
  {
    id: "17",
    fromName: "Delivery Team",
    from: "notifications@logistics.example.com",
    subject: "Shipment update – out for delivery",
    body: `Your order is out for delivery today. Track it using the link in your account. Our domain resolves to a known logistics provider.

— Delivery Team`,
    deterministicLabels: ["domain-resolves-known-provider", "smtp-automation", "first-domain"],
  },
]

/** Hilarious "wild" emails to inject into the demo */
export const wildEmails: Omit<ExampleEmail, "id">[] = [
  {
    fromName: "Prince Nwabudike",
    from: "prince.nwabudike@royalbankofnigeria.ng",
    subject: "URGENT: $47,000,000 USD – Your assistance required",
    body: `Dearest Friend,

I am Prince Nwabudike, son of the late King of Nigeria. My father has left $47 MILLION in a secure account and I need a trusted foreign partner to transfer it. You will receive 40% ($18.8 million) for your help.

Please reply with your full name, address, social security number, and bank account details. This is 100% legitimate – my lawyer (also a prince) can confirm.

God bless,
Prince Nwabudike`,
    deterministicLabels: ["new-domain", "domain-down", "no-spf", "no-dmarc", "no-txt", "first-domain"],
  },
  {
    fromName: "Vehicle Services Department",
    from: "warranty@extended-vehicle-protection.com",
    subject: "FINAL NOTICE: Your car's extended warranty is about to expire",
    body: `Hi there,

Our records show your vehicle's extended warranty is expiring in the next 24-48 hours. We've been trying to reach you.

Press 1 to speak to a warranty specialist now.
Press 2 to extend your warranty for 5 easy payments of $299.99.
Press 3 to hear this message again forever.

This is your FINAL notice. We will not contact you again (we will contact you again tomorrow).

– Vehicle Services Department`,
    deterministicLabels: ["new-domain", "no-spf", "no-dmarc", "smtp-automation", "first-domain"],
  },
  {
    fromName: "Dr. Meowington",
    from: "dr.meowington@catfacts.daily",
    subject: "You have been selected for 1 FREE cat fact per day",
    body: `Congratulations!

You have been randomly selected to receive ONE (1) FREE cat fact every day for the rest of your life.

Today's fact: A group of cats is called a "clowder." A group of cats standing in line at the DMV is called "still a clowder."

Reply STOP to stop (we will ignore this).
Reply MORE to receive 47 cat facts per day.

– Dr. Meowington, PhD (Cat Science)`,
    deterministicLabels: ["new-domain", "no-txt", "smtp-other", "first-domain"],
  },
  {
    fromName: "Conspiracy Facts Weekly",
    from: "newsletter@thebirdsarentreal.org",
    subject: "Birds. They're not real. Here's the proof.",
    body: `Friend,

You've suspected it. We have the documents.

Birds were replaced by government surveillance drones in the 1950s. "Bird watching" is actually the CIA's recruitment program. Big Seed is in on it.

This week's exclusive: Pigeons are just drones with feathers GLUED ON. We have photos.

Subscribe for $9.99/month. The truth isn't free (but it's cheaper than Netflix).

– Conspiracy Facts Weekly`,
    deterministicLabels: ["new-domain", "smtp-other", "first-domain"],
  },
  {
    fromName: "Grandma",
    from: "grandma@aol.com",
    subject: "FWD: FWD: FWD: Send this to 10 people or you will have BAD LUCK!!!!",
    body: `Hi Sweetie,

A man in Florida didn't forward this and the next day his TOASTER exploded. Not saying it's related but forward this to 10 people in the next 10 minutes.

Also I put your birthday card in the mail in 1998. Let me know when you get it.

Love,
Grandma

P.S. Please help your cousin with his "computer virus" he says he sent money to the Microsoft man on the phone`,
    deterministicLabels: ["smtp-other", "first-address"],
  },
  {
    fromName: "Larry from the Office",
    from: "larry@company.com",
    subject: "Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: the thing",
    body: `Hey,

Just following up on the thing we discussed. Let me know your thoughts.

Thanks,
Larry

---
From: Larry
Sent: Yesterday
To: You
Subject: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: the thing

Hey, following up on the thing. Thoughts?

---
[Previous 47 replies omitted]`,
    deterministicLabels: ["smtp-work-email"],
  },
  {
    fromName: "Support",
    from: "support@totally-legit-crypto.io",
    subject: "Your Bitcoin has been sent! (Please send 0.5 BTC to unlock)",
    body: `Congratulations!

We have sent 2.5 BTC to your wallet. To complete the transfer and receive your funds, please send 0.5 BTC to the following address to cover "network verification fees": [address]

This is a one-time fee. You will receive your 2.5 BTC within 24-48 business years.

Do not share this email with anyone. Especially not the police.

– Support Team`,
    deterministicLabels: ["new-domain", "domain-redirects", "no-spf", "no-dmarc", "first-domain"],
  },
  {
    fromName: "Gary",
    from: "gary@basement.com",
    subject: "I have invented a new type of email",
    body: `Hello,

I have been working in my basement for 12 years and have invented a new type of email that is 10x faster than regular email. It is called "GaryMail."

I need $50,000 to buy a server. In return you will get 5% of GaryMail when it replaces the internet.

Please wire funds to my cousin. He is a banker.

Gary`,
    deterministicLabels: ["domain-down", "no-spf", "no-dmarc", "no-txt", "first-domain"],
  }
]

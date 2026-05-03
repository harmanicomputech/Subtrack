export interface ParsedEmail {
  messageId: string;
  senderDomain: string;
  senderName: string;
  subject: string;
  snippet: string;
  date: string;
}

export interface DetectedSubscription {
  merchantName: string;
  amount: number | null;
  currency: string;
  billingCycle: string;
  category: string;
  confidenceScore: number;
  emailMetadata: {
    messageId: string;
    senderDomain: string;
    subject: string;
    detectedDate: string;
  };
}

// Keyword patterns that signal subscription-related emails
const SUBSCRIPTION_SUBJECTS = [
  /your subscription/i,
  /invoice from/i,
  /payment receipt/i,
  /payment confirmation/i,
  /subscription renewed/i,
  /subscription confirmation/i,
  /renewal notice/i,
  /billing receipt/i,
  /your receipt/i,
  /trial ending/i,
  /free trial/i,
  /order confirmation/i,
  /monthly charge/i,
  /annual renewal/i,
  /auto-renewal/i,
  /membership fee/i,
  /payment processed/i,
  /thank you for your payment/i,
  /your plan/i,
  /charged.*£/i,
  /debit.*£/i,
];

const SUBSCRIPTION_BODY_KEYWORDS = [
  "subscription", "monthly", "annually", "billed", "charged",
  "renewal", "plan", "membership", "invoice", "receipt",
];

// Known merchant domains mapped to names and categories
const KNOWN_DOMAINS: Record<string, { name: string; category: string; billingCycle: string }> = {
  "netflix.com": { name: "Netflix", category: "Entertainment", billingCycle: "monthly" },
  "spotify.com": { name: "Spotify", category: "Entertainment", billingCycle: "monthly" },
  "amazon.co.uk": { name: "Amazon Prime", category: "Shopping", billingCycle: "monthly" },
  "amazon.com": { name: "Amazon Prime", category: "Shopping", billingCycle: "monthly" },
  "apple.com": { name: "Apple", category: "Technology", billingCycle: "monthly" },
  "google.com": { name: "Google One", category: "Technology", billingCycle: "monthly" },
  "microsoft.com": { name: "Microsoft 365", category: "Technology", billingCycle: "monthly" },
  "disneyplus.com": { name: "Disney+", category: "Entertainment", billingCycle: "monthly" },
  "sky.com": { name: "Sky", category: "Entertainment", billingCycle: "monthly" },
  "adobe.com": { name: "Adobe Creative Cloud", category: "Technology", billingCycle: "monthly" },
  "audible.com": { name: "Audible", category: "Entertainment", billingCycle: "monthly" },
  "deliveroo.co.uk": { name: "Deliveroo Plus", category: "Food & Drink", billingCycle: "monthly" },
  "hbomax.com": { name: "HBO Max", category: "Entertainment", billingCycle: "monthly" },
  "primevideo.com": { name: "Amazon Prime Video", category: "Entertainment", billingCycle: "monthly" },
  "dazn.com": { name: "DAZN", category: "Entertainment", billingCycle: "monthly" },
  "paramount.com": { name: "Paramount+", category: "Entertainment", billingCycle: "monthly" },
  "dropbox.com": { name: "Dropbox", category: "Technology", billingCycle: "monthly" },
  "github.com": { name: "GitHub", category: "Technology", billingCycle: "monthly" },
  "notion.so": { name: "Notion", category: "Technology", billingCycle: "monthly" },
  "slack.com": { name: "Slack", category: "Technology", billingCycle: "monthly" },
  "zoom.us": { name: "Zoom", category: "Technology", billingCycle: "monthly" },
  "grammarly.com": { name: "Grammarly", category: "Technology", billingCycle: "monthly" },
  "1password.com": { name: "1Password", category: "Technology", billingCycle: "monthly" },
};

// Extract GBP amounts from text
export function extractAmount(text: string): number | null {
  const patterns = [
    /£\s*(\d+(?:\.\d{1,2})?)/,
    /GBP\s*(\d+(?:\.\d{1,2})?)/,
    /(\d+(?:\.\d{1,2})?)\s*GBP/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  return null;
}

// Extract billing cycle from text
export function extractBillingCycle(text: string): string {
  const lower = text.toLowerCase();
  if (/annual|yearly|year/.test(lower)) return "yearly";
  if (/weekly|week/.test(lower)) return "weekly";
  return "monthly";
}

// Check if subject line looks like a subscription email
export function isSubscriptionEmail(subject: string, snippet: string): boolean {
  const text = `${subject} ${snippet}`;
  return SUBSCRIPTION_SUBJECTS.some((pattern) => pattern.test(text));
}

// Extract domain from email address string like "Netflix <no-reply@netflix.com>"
export function extractDomain(fromHeader: string): string {
  const emailMatch = fromHeader.match(/@([\w.-]+)/);
  return emailMatch ? emailMatch[1].toLowerCase() : "";
}

// Extract sender display name from "Name <email>" format
export function extractSenderName(fromHeader: string): string {
  const nameMatch = fromHeader.match(/^([^<]+)</);
  if (nameMatch) return nameMatch[1].trim().replace(/"/g, "");
  const emailMatch = fromHeader.match(/([^@<]+)@/);
  return emailMatch ? emailMatch[1] : fromHeader;
}

// Parse a single email into a detected subscription (or null if not relevant)
export function parseEmailToSubscription(email: ParsedEmail): DetectedSubscription | null {
  if (!isSubscriptionEmail(email.subject, email.snippet)) return null;

  const domain = email.senderDomain;
  const known = KNOWN_DOMAINS[domain];

  const amount = extractAmount(`${email.subject} ${email.snippet}`);
  const billingCycle = known?.billingCycle ?? extractBillingCycle(`${email.subject} ${email.snippet}`);

  // For known domains, high confidence; for unknowns, lower
  const merchantName = known?.name ?? email.senderName.split(" ").slice(0, 3).join(" ");
  const category = known?.category ?? "Other";
  const confidenceScore = known ? 0.92 : 0.65;

  return {
    merchantName,
    amount,
    currency: "GBP",
    billingCycle,
    category,
    confidenceScore,
    emailMetadata: {
      messageId: email.messageId,
      senderDomain: domain,
      subject: email.subject,
      detectedDate: email.date,
    },
  };
}

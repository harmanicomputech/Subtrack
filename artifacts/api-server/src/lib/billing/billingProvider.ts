import type { User } from "@workspace/db";

export interface CheckoutResult {
  url: string;
}

export type WebhookAction = "activated" | "cancelled" | "past_due";

export interface WebhookResult {
  handled: boolean;
  userId?: number;
  action?: WebhookAction;
  reference?: string;
}

export interface BillingProvider {
  readonly name: string;
  createCheckoutSession(user: User, domain: string): Promise<CheckoutResult>;
  handleWebhook(rawBody: Buffer, headers: Record<string, string>): Promise<WebhookResult>;
  /** Paystack-specific: verify payment after callback redirect */
  verifyCallback?(reference: string): Promise<{ success: boolean; userId: number }>;
}

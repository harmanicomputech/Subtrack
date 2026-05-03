import type { BillingProvider } from "./billingProvider";
import { StripeProvider } from "./stripeProvider";
import { PaystackProvider } from "./paystackProvider";

export { type BillingProvider, type CheckoutResult, type WebhookResult, type WebhookAction } from "./billingProvider";

/**
 * Returns the active billing provider based on the PAYMENT_PROVIDER env var.
 * Defaults to Stripe if the variable is not set.
 *
 * Supported values:
 *   "stripe"   — Stripe checkout (STRIPE_MODE=demo|live)
 *   "paystack" — Paystack checkout
 */
export function getBillingProvider(): BillingProvider {
  const provider = (process.env["PAYMENT_PROVIDER"] ?? "stripe").toLowerCase().trim();
  if (provider === "paystack") return new PaystackProvider();
  return new StripeProvider();
}

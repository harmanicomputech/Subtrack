import type { BillingProvider } from "./billingProvider";
import { StripeProvider } from "./stripeProvider";

export { type BillingProvider, type CheckoutResult, type WebhookResult, type WebhookAction } from "./billingProvider";

export function getBillingProvider(): BillingProvider {
  return new StripeProvider();
}

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";
import type { BillingProvider, CheckoutResult, WebhookResult } from "./billingProvider";
import { logger } from "../logger";

function getStripe(): Stripe {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

function isDemoMode(): boolean {
  return (process.env["STRIPE_MODE"] ?? "demo").toLowerCase() === "demo";
}

export class StripeProvider implements BillingProvider {
  readonly name = "stripe";

  async createCheckoutSession(user: User, domain: string): Promise<CheckoutResult> {
    if (isDemoMode()) {
      // Demo mode — return the internal simulator page; no Stripe API call
      logger.info({ userId: user.id }, "Stripe demo checkout session created");
      return { url: `${domain}/billing/demo-checkout` };
    }

    // Live mode — real Stripe Checkout Session
    const priceId = process.env["STRIPE_PRICE_ID"];
    if (!priceId) throw new Error("STRIPE_PRICE_ID is not configured");

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.stripeCustomerId ? undefined : user.email,
      customer: user.stripeCustomerId ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${domain}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${domain}/dashboard`,
      metadata: { userId: String(user.id) },
      subscription_data: { metadata: { userId: String(user.id) } },
      locale: "en-GB",
      currency: "gbp",
    });

    if (!session.url) throw new Error("No checkout URL returned from Stripe");
    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, headers: Record<string, string>): Promise<WebhookResult> {
    if (isDemoMode()) {
      // Demo mode — webhook simulation is handled inline by demo-confirm endpoint
      return { handled: false };
    }

    const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
    if (!webhookSecret) {
      logger.warn("STRIPE_WEBHOOK_SECRET not set — skipping verification");
      return { handled: false };
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(rawBody, headers["stripe-signature"] ?? "", webhookSecret);
    } catch (err) {
      logger.warn({ err }, "Stripe webhook signature invalid");
      throw new Error("Invalid Stripe signature");
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = Number(session.metadata?.userId);
        if (!userId) return { handled: false };

        await db.update(usersTable).set({
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          subscriptionStatus: "active",
          subscriptionPlan: "pro",
          billingProvider: "stripe",
        }).where(eq(usersTable.id, userId));

        logger.info({ userId }, "User upgraded to Pro via Stripe");
        return { handled: true, userId, action: "activated" };
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await db.update(usersTable).set({ subscriptionStatus: "active" })
          .where(eq(usersTable.stripeCustomerId, invoice.customer as string));
        return { handled: true, action: "activated" };
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await db.update(usersTable).set({ subscriptionStatus: "past_due" })
          .where(eq(usersTable.stripeCustomerId, invoice.customer as string));
        logger.warn({ customerId: invoice.customer }, "Stripe payment failed");
        return { handled: true, action: "past_due" };
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await db.update(usersTable).set({
          subscriptionStatus: "cancelled",
          subscriptionPlan: null,
          stripeSubscriptionId: null,
        }).where(eq(usersTable.stripeCustomerId, sub.customer as string));
        logger.info({ customerId: sub.customer }, "Stripe subscription cancelled");
        return { handled: true, action: "cancelled" };
      }

      default:
        return { handled: false };
    }
  }
}

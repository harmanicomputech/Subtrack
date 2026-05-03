import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";
import type { BillingProvider, CheckoutResult, WebhookResult } from "./billingProvider";
import { logger } from "../logger";

const PAYSTACK_API = "https://api.paystack.co";

function getKey(): string {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

/** Amount in smallest unit. GBP → pence (£4 = 400). NGN → kobo (₦6500 = 650000). */
function getAmountAndCurrency(): { amount: number; currency: string } {
  const currency = (process.env["PAYSTACK_CURRENCY"] ?? "GBP").toUpperCase();
  // £4/month in pence; if NGN override PAYSTACK_AMOUNT env var
  const amount = process.env["PAYSTACK_AMOUNT"] ? Number(process.env["PAYSTACK_AMOUNT"]) : 400;
  return { amount, currency };
}

async function paystackFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json() as { status: boolean; message: string; data: T };
  if (!data.status) throw new Error(`Paystack error: ${data.message}`);
  return data.data;
}

export class PaystackProvider implements BillingProvider {
  readonly name = "paystack";

  async createCheckoutSession(user: User, domain: string): Promise<CheckoutResult> {
    const { amount, currency } = getAmountAndCurrency();
    const callbackUrl = `${domain}/api/billing/paystack/callback`;

    const data = await paystackFetch<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount,
        currency,
        callback_url: callbackUrl,
        metadata: {
          userId: user.id,
          plan: "pro",
          custom_fields: [
            { display_name: "Plan", variable_name: "plan", value: "Recuris Pro" },
          ],
        },
      }),
    });

    logger.info({ userId: user.id, reference: data.reference }, "Paystack checkout initialized");
    return { url: data.authorization_url };
  }

  async handleWebhook(rawBody: Buffer, headers: Record<string, string>): Promise<WebhookResult> {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured");

    // Verify HMAC-SHA512 signature
    const signature = headers["x-paystack-signature"] ?? "";
    const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    if (hash !== signature) {
      logger.warn("Paystack webhook signature invalid");
      throw new Error("Invalid Paystack signature");
    }

    const event = JSON.parse(rawBody.toString()) as {
      event: string;
      data: {
        reference: string;
        status: string;
        amount: number;
        currency: string;
        metadata?: { userId?: number };
        customer?: { email?: string };
      };
    };

    if (event.event !== "charge.success") return { handled: false };
    if (event.data.status !== "success") return { handled: false };

    const userId = event.data.metadata?.userId;
    const reference = event.data.reference;

    if (!userId) {
      // Fallback: look up by customer email
      const email = event.data.customer?.email;
      if (!email) return { handled: false };

      await db.update(usersTable).set({
        subscriptionStatus: "active",
        subscriptionPlan: "pro",
        billingProvider: "paystack",
        paymentReference: reference,
      }).where(eq(usersTable.email, email));

      logger.info({ email, reference }, "User upgraded to Pro via Paystack (email lookup)");
      return { handled: true, action: "activated", reference };
    }

    await db.update(usersTable).set({
      subscriptionStatus: "active",
      subscriptionPlan: "pro",
      billingProvider: "paystack",
      paymentReference: reference,
    }).where(eq(usersTable.id, userId));

    logger.info({ userId, reference }, "User upgraded to Pro via Paystack");
    return { handled: true, userId, action: "activated", reference };
  }

  async verifyCallback(reference: string): Promise<{ success: boolean; userId: number }> {
    const data = await paystackFetch<{
      status: string;
      amount: number;
      currency: string;
      metadata?: { userId?: number };
      customer?: { email?: string };
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);

    if (data.status !== "success") return { success: false, userId: 0 };

    const userId = data.metadata?.userId;
    if (!userId) {
      // Fallback: look up by email and update
      const email = data.customer?.email;
      if (!email) return { success: false, userId: 0 };

      const [user] = await db.select({ id: usersTable.id })
        .from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (!user) return { success: false, userId: 0 };

      await db.update(usersTable).set({
        subscriptionStatus: "active",
        subscriptionPlan: "pro",
        billingProvider: "paystack",
        paymentReference: reference,
      }).where(eq(usersTable.id, user.id));

      return { success: true, userId: user.id };
    }

    await db.update(usersTable).set({
      subscriptionStatus: "active",
      subscriptionPlan: "pro",
      billingProvider: "paystack",
      paymentReference: reference,
    }).where(eq(usersTable.id, userId));

    logger.info({ userId, reference }, "Paystack payment verified via callback");
    return { success: true, userId };
  }
}

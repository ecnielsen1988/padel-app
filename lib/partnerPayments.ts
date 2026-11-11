import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PARTNER_FEE_OERE, type PartnerRegistration } from "@/lib/partnerTournaments";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

const db = supabaseServiceRole as SupabaseClient;
const amount = { currency: "DKK", value: PARTNER_FEE_OERE };
const paymentPath = "/epayment/v1/payments";
const referencePrefix = "makker-";

export function paymentConfig() {
  const mode = process.env.MOBILEPAY_EPAYMENT_MODE;
  const msn = process.env.MOBILEPAY_MSN;
  const clientId = process.env.MOBILEPAY_CLIENT_ID;
  const clientSecret = process.env.MOBILEPAY_CLIENT_SECRET;
  const subscriptionKey = process.env.MOBILEPAY_SUBSCRIPTION_KEY;
  const webhookSecret = process.env.MOBILEPAY_WEBHOOK_SECRET;
  const appUrl = process.env.MOBILEPAY_APP_URL;
  if ((mode !== "test" && mode !== "production") || !msn || !/^\d{4,10}$/.test(msn) ||
    !clientId || !clientSecret || !subscriptionKey || !webhookSecret || !appUrl) return null;

  if (!URL.canParse(appUrl)) return null;
  const app = new URL(appUrl);
  if (app.protocol !== "https:" || app.username || app.password) return null;

  return {
    mode, msn, clientId, clientSecret, subscriptionKey, webhookSecret,
    merchant: `${mode}:${msn}`,
    returnUrl: new URL("/makkerrangliste", app),
    apiUrl: mode === "test" ? "https://apitest.vipps.no" : "https://api.vipps.no",
  };
}

type Config = NonNullable<ReturnType<typeof paymentConfig>>;
type Amount = { currency: string; value: number };
type Payment = {
  reference: string;
  amount: Amount;
  state: string;
  redirectUrl?: string;
  aggregate: {
    capturedAmount: Amount;
    cancelledAmount: Amount;
    refundedAmount: Amount;
  };
};

async function mobilePayClient(config: Config) {
  const headers = {
    "Merchant-Serial-Number": config.msn,
    "Ocp-Apim-Subscription-Key": config.subscriptionKey,
    "Vipps-System-Name": "padel-app",
    "Vipps-System-Version": "0.1.0",
  };
  const tokenResponse = await fetch(`${config.apiUrl}/accesstoken/get`, {
    method: "POST",
    headers: { ...headers, client_id: config.clientId, client_secret: config.clientSecret },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!tokenResponse.ok) throw new Error(`MobilePay access token returned ${tokenResponse.status}`);
  const { access_token: token } = await tokenResponse.json();
  if (typeof token !== "string" || !token) throw new Error("MobilePay access token missing");

  return (path: string, body?: unknown, idempotencyKey?: string) => fetch(`${config.apiUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
}

async function settle(id: string, config: Config, status: "paid" | "cancelled") {
  const { data, error } = await db.rpc("finish_partner_registration", {
    p_id: id, p_merchant: config.merchant, p_status: status,
  });
  if (error || !data) throw new Error("Kunne ikke gemme betalingsstatus.");
  return { status: data as PartnerRegistration["status"] };
}

function isFee(value: Amount | undefined) {
  return value?.currency === amount.currency && value.value === amount.value;
}

function redirect(status: "pending", url: unknown) {
  if (typeof url !== "string" || (!URL.canParse(url) || new URL(url).protocol !== "https:")) {
    throw new Error("MobilePay returnerede intet betalingslink.");
  }
  return { status, redirectUrl: url };
}

export async function syncPartnerPayment(config: Config, id: string, resume = false) {
  const client = await mobilePayClient(config);
  const reference = `${referencePrefix}${id}`;
  const path = `${paymentPath}/${reference}`;
  const response = await client(path);
  if (response.status === 404) {
    if (!resume) return { status: "pending" as const };
    const returnUrl = new URL(config.returnUrl);
    returnUrl.searchParams.set("betaling", id);
    const created = await client(paymentPath, {
      amount,
      reference,
      returnUrl: returnUrl.href,
      paymentMethod: { type: "WALLET" },
      userFlow: "WEB_REDIRECT",
      paymentDescription: "Tilmelding til makkerranglisten (1 par)",
    }, `${id}-create`);
    if (!created.ok) throw new Error(`MobilePay create returned ${created.status}`);
    const payment = await created.json();
    if (payment.reference !== reference) throw new Error("MobilePay betalingsreference afviger.");
    return redirect("pending", payment.redirectUrl);
  }
  if (!response.ok) throw new Error(`MobilePay lookup returned ${response.status}`);

  const payment: Payment = await response.json();
  if (payment.reference !== reference || !isFee(payment.amount)) {
    throw new Error("MobilePay betalingsreference eller beløb afviger.");
  }
  if (["ABORTED", "EXPIRED", "TERMINATED"].includes(payment.state)) {
    return settle(id, config, "cancelled");
  }
  if (payment.state === "AUTHORIZED") {
    if (isFee(payment.aggregate.cancelledAmount) || isFee(payment.aggregate.refundedAmount)) {
      return settle(id, config, "cancelled");
    }
    if (payment.aggregate.refundedAmount.value > 0) {
      throw new Error("MobilePay-betalingen er delvist refunderet.");
    }
    if (isFee(payment.aggregate.capturedAmount)) return settle(id, config, "paid");

    const captured = await client(`${path}/capture`, { modificationAmount: amount }, `${id}-capture`);
    if (!captured.ok) throw new Error(`MobilePay capture returned ${captured.status}`);
    const result: Payment = await captured.json();
    if (result.reference !== reference || !isFee(result.aggregate?.capturedAmount)) {
      throw new Error("MobilePay har endnu ikke bekræftet det fulde beløb.");
    }
    return settle(id, config, "paid");
  }
  if (payment.state === "CREATED" && resume) return redirect("pending", payment.redirectUrl);
  return { status: "pending" as const };
}

export function verifyMobilePayWebhook(request: Request, body: Buffer, config: Config) {
  const host = request.headers.get("host");
  const date = request.headers.get("x-ms-date");
  const contentHash = createHash("sha256").update(body).digest("base64");
  const auth = request.headers.get("authorization");
  if (!host || !date || !auth || request.headers.get("x-ms-content-sha256") !== contentHash) return false;

  const { pathname, search } = new URL(request.url);
  const signature = createHmac("sha256", config.webhookSecret)
    .update(`POST\n${pathname}${search}\n${date};${host};${contentHash}`).digest("base64");
  const expected = Buffer.from(`HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`);
  const actual = Buffer.from(auth);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function partnerRegistrationId(reference: unknown) {
  return typeof reference === "string" && reference.startsWith(referencePrefix)
    ? reference.slice(referencePrefix.length)
    : "";
}

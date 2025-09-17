// app/routes/check-subscriber.ts
import type { ActionFunctionArgs } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  const { email } = await request.json();

  // Call Shopify Admin API to find the customer by email
  const res = await fetch(`https://${process.env.SHOP}/admin/api/2025-01/customers/search.json?query=email:${email}`, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN!,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  const customer = data.customers?.[0];

  return Response.json({
    customerId: customer?.id ?? null,
    isSubscribed: customer?.email_marketing_consent?.state === "subscribed",
  });
}

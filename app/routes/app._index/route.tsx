// app/routes/check-subscriber.ts
import type { ActionFunctionArgs } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    console.log("OPTIONS preflight hit");
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const { email } = await request.json();
    console.log("Got email:", email);

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const res = await fetch(
      `https://${process.env.SHOP}/admin/api/2025-01/customers/search.json?query=email:${email}`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN!,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await res.json();
    console.log("Shopify API response:", data);

    const customer = data.customers?.[0];

    return new Response(
      JSON.stringify({
        customerId: customer?.id ?? null,
        isSubscribed:
          customer?.email_marketing_consent?.state === "subscribed",
      }),
      {
        headers: corsHeaders,
      }
    );
  } catch (err) {
    console.error("check-subscriber error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

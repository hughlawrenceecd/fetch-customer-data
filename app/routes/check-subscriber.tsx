// app/routes/check-subscriber.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  
  return new Response(null, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { email } = await request.json();

    const res = await fetch(
      `https://${process.env.SHOP}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN!,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await res.json();
    const customer = data.customers?.[0];

    return new Response(
      JSON.stringify({
        customerId: customer?.id ?? null,
        isSubscribed: customer?.email_marketing_consent?.state === "subscribed",
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (err) {
    console.error("Error in /check-subscriber:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
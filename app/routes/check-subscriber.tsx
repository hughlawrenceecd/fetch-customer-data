// app/routes/test.tsx
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email") || "hugh.lawrence@ecigarettedirect.co.uk";
  
  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    // Test Shopify API connection
    const shop = process.env.SHOP || "your-store.myshopify.com";
    const token = process.env.SHOPIFY_ADMIN_TOKEN || "your-token";
    
    const res = await fetch(
      `https://${shop}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}`,
      {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      return new Response(
        JSON.stringify({ 
          error: `Shopify API error: ${res.status} ${res.statusText}`,
          details: `Trying to access: https://${shop}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}`
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const data = await res.json();
    const customer = data.customers?.[0];

    return new Response(
      JSON.stringify({
        success: true,
        customerId: customer?.id ?? null,
        isSubscribed: customer?.email_marketing_consent?.state === "subscribed",
        customer: customer || null,
        environment: {
          shop: shop,
          tokenSet: !!token,
          tokenLength: token.length
        }
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error in test endpoint:", err);
    return new Response(
      JSON.stringify({ 
        error: "Server error",
        message: err.message 
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return loader({ request });
}
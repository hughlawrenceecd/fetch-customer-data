// app/routes/check-subscriber.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  
  return new Response(null, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const { email } = await request.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        },
      });
    }

    const shop = process.env.SHOP;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    
    // Clean up the shop domain (remove https:// if present)
    const cleanShop = shop ? shop.replace(/^https?:\/\//, '') : '';
    
    if (!cleanShop || !token) {
      return new Response(
        JSON.stringify({ 
          error: "Server configuration error",
          details: {
            shop: cleanShop,
            tokenSet: !!token,
            tokenLength: token ? token.length : 0
          }
        }), 
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
          },
        }
      );
    }

    const res = await fetch(
      `https://${cleanShop}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}`,
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
          shop: cleanShop
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
          },
        }
      );
    }

    const data = await res.json();
    const customer = data.customers?.[0];

    return new Response(
      JSON.stringify({
        customerId: customer?.id ?? null,
        isSubscribed: customer?.email_marketing_consent?.state === "subscribed",
        customerExists: !!customer
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        },
      }
    );
  } catch (err) {
    console.error("Error in /check-subscriber:", err);
    return new Response(
      JSON.stringify({ 
        error: "Server error",
        message: err.message 
      }), 
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        },
      }
    );
  }
}
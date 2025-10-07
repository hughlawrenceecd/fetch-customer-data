// app/routes/check-subscriber.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

// ----------------------------
// LOADER
// ----------------------------
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

// ----------------------------
// ACTION
// ----------------------------
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
    const body = await request.json();
    const { email, action: requestAction, firstName, lastName, orderId } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        },
      });
    }

    // Handle subscription request (Shopify only)
    if (requestAction === "subscribe") {
      return await handleShopifySubscription(email, firstName, lastName, orderId);
    }

    // Default: check subscriber status
    return await checkSubscriberStatus(email);

  } catch (err: any) {
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

// ----------------------------
// HANDLE SHOPIFY SUBSCRIPTION
// ----------------------------
async function handleShopifySubscription(
  email: string,
  firstName?: string,
  lastName?: string,
  orderId?: string
) {
  const shop = process.env.SHOP;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const cleanShop = shop ? shop.replace(/^https?:\/\//, "") : "";

  if (!cleanShop || !token) {
    return new Response(
      JSON.stringify({ error: "Shopify credentials missing or invalid" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        },
      }
    );
  }

  console.log("Starting Shopify subscription for:", email);

  // Step 1: Find customer by email
  const searchRes = await fetch(
    `https://${cleanShop}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}`,
    {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    }
  );

  const searchData = await searchRes.json();
  const customer = searchData.customers?.[0];

  if (!customer) {
    console.log(`No Shopify customer found for ${email}`);
    return new Response(
      JSON.stringify({ success: false, message: "Customer not found in Shopify" }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        },
      }
    );
  }

  // Step 2: Add tag + mark subscribed
  const customerId = customer.id;
  const tagsUrl = `https://${cleanShop}/admin/api/2024-01/customers/${customerId}.json`;

  const updatedTags = Array.from(
    new Set([...(customer.tags?.split(",") || []), "post-checkout-test-tag"])
  )
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");

  const updateRes = await fetch(tagsUrl, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer: {
        id: customerId,
        first_name: firstName || customer.first_name,
        last_name: lastName || customer.last_name,
        tags: updatedTags,
        email_marketing_consent: {
          state: "subscribed",
          opt_in_level: "single_opt_in",
          consent_updated_at: new Date().toISOString(),
        },
      },
    }),
  });

  if (!updateRes.ok) {
    const text = await updateRes.text();
    console.error("Failed to update Shopify subscription:", text);
    return new Response(
      JSON.stringify({ success: false, message: "Failed to update Shopify customer" }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        },
      }
    );
  }

  console.log(`✅ Shopify customer ${email} subscribed + tagged`);

  return new Response(
    JSON.stringify({
      success: true,
      message: "Customer subscribed in Shopify and tagged successfully",
      status: "subscribed",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
      },
    }
  );
}

// ----------------------------
// CHECK SUBSCRIBER STATUS
// ----------------------------
async function checkSubscriberStatus(email: string) {
  const shop = process.env.SHOP;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const cleanShop = shop ? shop.replace(/^https?:\/\//, "") : "";

  if (!cleanShop || !token) {
    return new Response(
      JSON.stringify({
        error: "Server configuration error",
        details: {
          shop: cleanShop,
          tokenSet: !!token,
          tokenLength: token ? token.length : 0,
        },
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
        shop: cleanShop,
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
      customerExists: !!customer,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
      },
    }
  );
}

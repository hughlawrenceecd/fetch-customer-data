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

    // Handle subscription request
    if (requestAction === "subscribe") {
      return await handleOmnisendSubscription(email, firstName, lastName, orderId);
    }

    // Default: check subscriber status
    return await checkSubscriberStatus(email);

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

// ----------------------------
// HANDLE OMNISEND SUBSCRIPTION
// ----------------------------
async function handleOmnisendSubscription(
  email: string,
  firstName?: string,
  lastName?: string,
  orderId?: string
) {
  console.log("Starting Omnisend v5 subscription for:", email);

  const omnisendApiKey = process.env.OMNISEND_API_KEY;
  if (!omnisendApiKey) {
    console.error("OMNISEND_API_KEY environment variable is not set");
    return new Response(
      JSON.stringify({
        error: "Omnisend API key not configured",
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

  // Test API key first
  try {
    const testResponse = await fetch("https://api.omnisend.com/v5/contacts?limit=1", {
      method: "GET",
      headers: { "X-API-KEY": omnisendApiKey },
    });

    if (!testResponse.ok) {
      const text = await testResponse.text();
      throw new Error(`Omnisend API connection failed: ${testResponse.status} - ${text}`);
    }
  } catch (err) {
    console.error("Omnisend API test failed:", err);
    throw new Error(`Omnisend API connection failed: ${err.message}`);
  }

  // Construct contact data
  const contactData = {
    identifiers: [
      {
        type: "email",
        id: email.toLowerCase(),
        channels: {
          email: {
            status: "subscribed",
            statusDate: new Date().toISOString(),
          },
        },
      },
    ],
    firstName: firstName || "",
    lastName: lastName || "",
    customProperties: {
      subscribedFrom: "shopify-thank-you-page",
      shopifyOrder: orderId || "unknown",
      subscriptionDate: new Date().toISOString(),
      shopifyCustomer: true,
    },
  };

  console.log("Sending Omnisend v5 subscription request:", JSON.stringify(contactData, null, 2));

  let omnisendResult = null;
  try {
    const omnisendResponse = await fetch("https://api.omnisend.com/v5/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": omnisendApiKey,
      },
      body: JSON.stringify(contactData),
    });

    const responseText = await omnisendResponse.text();
    console.log("Omnisend v5 response:", omnisendResponse.status, responseText);

    if (!omnisendResponse.ok && omnisendResponse.status !== 409) {
      throw new Error(`Omnisend subscription failed: ${omnisendResponse.status} - ${responseText}`);
    }

    omnisendResult = responseText ? JSON.parse(responseText) : {};
  } catch (err) {
    console.error("Error subscribing in Omnisend:", err);
    throw err;
  }

  // ----------------------------------------
  // ADD SHOPIFY TAG AFTER SUCCESSFUL SUBSCRIBE
  // ----------------------------------------
  let tagResult = { success: false, message: "Skipped" };
  try {
    tagResult = await addShopifyCustomerTag(email, "post-checkout-test-tag");
  } catch (err) {
    console.error("Failed to add Shopify tag:", err);
  }

  // ----------------------------------------
  // RETURN COMBINED RESULT
  // ----------------------------------------
  return new Response(
    JSON.stringify({
      success: true,
      message: "Successfully subscribed to Omnisend and tagged in Shopify",
      data: { omnisend: omnisendResult, shopifyTag: tagResult },
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
// ADD SHOPIFY CUSTOMER TAG
// ----------------------------
async function addShopifyCustomerTag(email: string, tag: string) {
  const shop = process.env.SHOP;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const cleanShop = shop ? shop.replace(/^https?:\/\//, "") : "";

  if (!cleanShop || !token) {
    console.error("Missing Shopify credentials");
    return { success: false, message: "Missing Shopify credentials" };
  }

  try {
    // Step 1: Find customer by email
    const searchRes = await fetch(
      `https://${cleanShop}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(
        email
      )}`,
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
      console.log(`No Shopify customer found for ${email}, skipping tag.`);
      return { success: false, message: "Customer not found" };
    }

    const customerId = customer.id;
    const tagsUrl = `https://${cleanShop}/admin/api/2024-01/customers/${customerId}.json`;

    // Merge tags safely
    const updatedTags = Array.from(
      new Set([...(customer.tags?.split(",") || []), tag])
    )
      .map((t) => t.trim())
      .filter(Boolean)
      .join(", ");

    // Step 2: Update customer tags
    const updateRes = await fetch(tagsUrl, {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customer: { id: customerId, tags: updatedTags } }),
    });

    if (!updateRes.ok) {
      const text = await updateRes.text();
      throw new Error(`Failed to update tags: ${updateRes.status} - ${text}`);
    }

    console.log(`✅ Tag "${tag}" added to Shopify customer: ${email}`);
    return { success: true, message: `Tag "${tag}" added` };
  } catch (err) {
    console.error("Error tagging Shopify customer:", err);
    return { success: false, message: err.message };
  }
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
    `https://${cleanShop}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(
      email
    )}`,
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

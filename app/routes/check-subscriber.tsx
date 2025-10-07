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

    // Default: check subscriber status (existing functionality)
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

// Handle Omnisend subscription
// Handle Omnisend subscription - V5 API
async function handleOmnisendSubscription(email: string, firstName?: string, lastName?: string, orderId?: string) {
  console.log("Starting Omnisend v5 subscription for:", email);
  
  const omnisendApiKey = process.env.OMNISEND_API_KEY;
  
  console.log("Omnisend API key present:", !!omnisendApiKey);
  
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

  // Test API key first with v5 endpoint
  try {
    console.log("Testing Omnisend v5 API key...");
    const testResponse = await fetch('https://api.omnisend.com/v5/contacts?limit=1', {
      method: 'GET',
      headers: {
        'X-API-KEY': omnisendApiKey,
      },
    });
    
    console.log("API key test response status:", testResponse.status);
    
    if (!testResponse.ok) {
      const testError = await testResponse.text();
      console.error("API key test failed. Status:", testResponse.status, "Error:", testError);
      throw new Error(`Omnisend API connection failed: ${testResponse.status} - ${testError}`);
    }
    
    console.log("API key test successful - v5 endpoint is accessible");
  } catch (testErr) {
    console.error("API key test error:", testErr);
    throw new Error(`Omnisend API connection failed: ${testErr.message}`);
  }

  // Create contact data according to v5 API structure
  const contactData = {
    identifiers: [
      {
        "type": "email",
        "id": email.toLowerCase(), // Email is case-sensitive in v5
        "channels": {
          "email": {
            "status": "subscribed",
            "statusDate": new Date().toISOString()
            // Note: For production, you should add consent properties:
            // "consent": {
            //   "source": "Shopify Checkout",
            //   "createdAt": new Date().toISOString(),
            //   "ip": "customer-ip-address", // You'd need to capture this
            //   "userAgent": "shopify-checkout-extension"
            // }
          }
        }
      }
    ],
    firstName: firstName || "",
    lastName: lastName || "",
    customProperties: {
      "subscribedFrom": "shopify-thank-you-page",
      "shopifyOrder": orderId || "unknown",
      "subscriptionDate": new Date().toISOString(),
      "shopifyCustomer": true
    },
    tags: ["post-checkout-test-tag"]
  };

  console.log("Making Omnisend v5 subscription request with data:", JSON.stringify(contactData, null, 2));

  try {
    const omnisendResponse = await fetch('https://api.omnisend.com/v5/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': omnisendApiKey,
      },
      body: JSON.stringify(contactData),
    });

    const responseText = await omnisendResponse.text();
    console.log("Omnisend v5 subscription response - Status:", omnisendResponse.status, "Body:", responseText);

    if (!omnisendResponse.ok) {
      if (omnisendResponse.status === 409) {
        console.log("Contact already exists in Omnisend - this is actually a success for us");
        // In v5, 409 means the contact already exists, which is fine for our use case
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Contact already exists in Omnisend',
            status: 'subscribed'
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
            },
          }
        );
      }
      
      throw new Error(`Omnisend subscription failed: ${omnisendResponse.status} - ${responseText}`);
    }

    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      result = { message: "Subscription successful (no response body)" };
    }
    
    console.log("Omnisend v5 subscription successful:", result);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Successfully subscribed to Omnisend',
        data: result,
        status: 'subscribed'
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        },
      }
    );

  } catch (err) {
    console.error("Error in Omnisend v5 subscription process:", err);
    throw err;
  }
}
// Existing function for checking subscriber status
async function checkSubscriberStatus(email: string) {
  const shop = process.env.SHOP;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  
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
}
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
async function handleOmnisendSubscription(email: string, firstName?: string, lastName?: string, orderId?: string) {
  const omnisendApiKey = process.env.OMNISEND_API_KEY;
  
  if (!omnisendApiKey) {
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

  const contactData = {
    identifiers: [{
      type: "email",
      id: email,
      channels: {
        email: {
          status: "subscribed",
          statusDate: new Date().toISOString()
        }
      }
    }],
    firstName: firstName || "",
    lastName: lastName || "",
    tags: ["shopify-customer", "thank-you-page-subscriber"],
    customProperties: {
      subscribedFrom: "shopify-thank-you-page",
      shopifyOrder: orderId || "unknown",
      subscriptionDate: new Date().toISOString()
    }
  };

  console.log("Making Omnisend API call for:", email);

  const omnisendResponse = await fetch('https://api.omnisend.com/v1/contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': omnisendApiKey,
    },
    body: JSON.stringify(contactData),
  });

  console.log("Omnisend API response status:", omnisendResponse.status);

  if (!omnisendResponse.ok) {
    // Handle existing contact (409 conflict)
    if (omnisendResponse.status === 409) {
      console.log("Contact exists, updating subscription status...");
      
      const updateResponse = await fetch('https://api.omnisend.com/v1/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': omnisendApiKey,
        },
        body: JSON.stringify(contactData),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Omnisend update failed: ${updateResponse.status} - ${errorText}`);
      }
      
      const updateResult = await updateResponse.json();
      console.log("Existing contact updated successfully");
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Existing contact updated successfully',
          status: 'subscribed',
          data: updateResult
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
          },
        }
      );
    }
    
    const errorText = await omnisendResponse.text();
    console.error("Omnisend API error:", errorText);
    throw new Error(`Omnisend API error: ${omnisendResponse.status} - ${errorText}`);
  }

  const result = await omnisendResponse.json();
  console.log("Omnisend subscription successful for:", email);
  
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
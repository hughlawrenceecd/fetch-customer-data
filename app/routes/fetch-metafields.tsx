// app/routes/get-metafields.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  return new Response(null, { status: 405, headers: corsHeaders() });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
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
        { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    const query = `
      query GetCheckoutSignupForm {
        metaobjects(type: "checkout_sign_up_form", first: 1) {
          edges {
            node {
              id
              fields {
                key
                value
              }
            }
          }
        }
      }
    `;

    const res = await fetch(
      `https://${cleanShop}/admin/api/2024-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: `Shopify API error: ${res.status} ${res.statusText}`,
          shop: cleanShop,
        }),
        { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const metaobject = data?.data?.metaobjects?.edges?.[0]?.node;

    const metafields: Record<string, string> = {};
    metaobject?.fields?.forEach((field: any) => {
      metafields[field.key] = field.value;
    });

    return new Response(
      JSON.stringify({
        metafields: {
          heading: metafields["heading"] ?? null,
          bodyText: metafields["body_text"] ?? null,
          buttonLink: metafields["button_link"] ?? null,
          buttonText: metafields["button_text"] ?? null,
        },
      }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in /get-metafields:", err);
    return new Response(
      JSON.stringify({ error: "Server error", message: err.message }),
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  }
}

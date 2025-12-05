import { authenticate } from "../shopify.server";

/**
 * App Proxy endpoint for importing customer data to operator's account
 * POST /apps/operator-panel/proxy/import-customer
 * 
 * Copies the selected customer's metafields and address to the logged-in operator's account
 */

export const action = async ({ request }) => {
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);

    // Parse request body
    let body;
    try {
      const text = await request.text();
      body = JSON.parse(text);
    } catch (parseError) {
      console.error("[import-customer] JSON parse error:", parseError);
      return new Response(
        JSON.stringify({ success: false, error: "リクエストボディの解析に失敗しました" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { operatorCustomerId, sourceCustomer } = body;

    if (!operatorCustomerId || !sourceCustomer) {
      return new Response(
        JSON.stringify({ success: false, error: "オペレーターIDまたは顧客データが不足しています" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Build metafields array
    const metafields = [];
    const sourceMetafields = sourceCustomer.metafields || {};

    // Store the source customer's ID for tracking
    if (sourceCustomer.id) {
      metafields.push({
        namespace: "custom",
        key: "operator_ordered_for_customer",
        value: String(sourceCustomer.id),
        type: "single_line_text_field",
      });
    }

    // card_id: use "0" if no value
    metafields.push({
      namespace: "custom",
      key: "card_id",
      value: sourceMetafields.cardId != null && sourceMetafields.cardId !== "" ? String(sourceMetafields.cardId) : "0",
      type: "single_line_text_field",
    });

    // customer_id: use "0" if no value
    metafields.push({
      namespace: "custom",
      key: "customer_id",
      value: sourceMetafields.customerId != null && sourceMetafields.customerId !== "" ? String(sourceMetafields.customerId) : "0",
      type: "single_line_text_field",
    });

    // points: use 0 if no value
    metafields.push({
      namespace: "custom",
      key: "points",
      value: sourceMetafields.points != null ? String(sourceMetafields.points) : "0",
      type: "number_integer",
    });

    // gender: use "回答せず" if no value (choices: "男性", "女性", "回答せず")
    metafields.push({
      namespace: "custom",
      key: "gender",
      value: sourceMetafields.gender != null && sourceMetafields.gender !== "" ? String(sourceMetafields.gender) : "回答せず",
      type: "single_line_text_field",
    });

    // birthday: only write if value exists, otherwise delete the metafield
    const shouldDeleteBirthday = sourceMetafields.birthday == null;
    if (!shouldDeleteBirthday) {
      metafields.push({
        namespace: "custom",
        key: "birthday",
        value: String(sourceMetafields.birthday),
        type: "date",
      });
    }

    // Build address input if defaultAddress exists
    let addressInput = null;
    let addressForCheckout = null;
    if (sourceCustomer.defaultAddress) {
      const addr = sourceCustomer.defaultAddress;
      // Address for customerDefaultAddressUpdate (uses country name)
      addressInput = {
        address1: addr.address1 || "",
        address2: addr.address2 || "",
        city: addr.city || "",
        company: addr.company || "",
        country: addr.country || "",
        firstName: addr.firstName || "",
        lastName: addr.lastName || "",
        phone: addr.phone || "",
        province: addr.province || "",
        zip: addr.zip || "",
      };
      
      // Address for Checkout UI (uses countryCode and provinceCode)
      addressForCheckout = {
        address1: addr.address1 || "",
        address2: addr.address2 || "",
        city: addr.city || "",
        company: addr.company || "",
        countryCode: addr.countryCodeV2 || "JP",
        firstName: addr.firstName || "",
        lastName: addr.lastName || "",
        phone: addr.phone || "",
        provinceCode: addr.provinceCode || "",
        zip: addr.zip || "",
      };
      
      // Store address as JSON metafield for Checkout UI to read and apply
      metafields.push({
        namespace: "custom",
        key: "shipping_address",
        value: JSON.stringify(addressForCheckout),
        type: "json",
      });
    } else {
      // Clear address metafield if no address
      metafields.push({
        namespace: "custom",
        key: "shipping_address",
        value: JSON.stringify({}),
        type: "json",
      });
    }

    // Update operator's customer record (metafields only)
    const graphqlResponse = await admin.graphql(
      `#graphql
      mutation UpdateOperatorCustomer($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            firstName
            lastName
            metafields(first: 10) {
              nodes {
                namespace
                key
                value
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: {
            id: operatorCustomerId,
            metafields: metafields.length > 0 ? metafields : undefined,
          },
        },
      }
    );

    const data = await graphqlResponse.json();

    // Add address to customer using customerAddressCreate
    if (addressInput) {
      try {
        const addressResponse = await admin.graphql(
          `#graphql
          mutation CreateOperatorAddress($customerId: ID!, $address: MailingAddressInput!) {
            customerAddressCreate(customerId: $customerId, address: $address) {
              customerAddress {
                id
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              customerId: operatorCustomerId,
              address: addressInput,
            },
          }
        );
        const addressData = await addressResponse.json();
        if (addressData.data?.customerAddressCreate?.userErrors?.length > 0) {
          console.error("[import-customer] Address create errors:", addressData.data.customerAddressCreate.userErrors);
        }
      } catch (addressError) {
        console.error("[import-customer] Failed to create address:", addressError.message);
      }
    }

    if (data.errors) {
      console.error("[import-customer] GraphQL errors:", data.errors);
      return new Response(
        JSON.stringify({ success: false, error: "顧客データの更新に失敗しました", details: data.errors }),
        { status: 500, headers: corsHeaders }
      );
    }

    const userErrors = data.data?.customerUpdate?.userErrors || [];
    if (userErrors.length > 0) {
      console.error("[import-customer] User errors:", userErrors);
      return new Response(
        JSON.stringify({ success: false, error: userErrors.map((e) => e.message).join(", "), userErrors }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Delete birthday metafield if source has no value
    if (shouldDeleteBirthday) {
      try {
        await admin.graphql(
          `#graphql
          mutation DeleteBirthdayMetafield($metafields: [MetafieldIdentifierInput!]!) {
            metafieldsDelete(metafields: $metafields) {
              deletedMetafields {
                ownerId
                namespace
                key
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              metafields: [{
                ownerId: operatorCustomerId,
                namespace: "custom",
                key: "birthday",
              }],
            },
          }
        );
      } catch (deleteError) {
        // Log but don't fail if delete fails
        console.error("[import-customer] Failed to delete birthday:", deleteError.message);
      }
    }

    const updatedCustomer = data.data?.customerUpdate?.customer;

    return new Response(
      JSON.stringify({ success: true, message: "顧客データを取り込みました", customer: updatedCustomer }),
      { status: 200, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[import-customer] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: "サーバーエラーが発生しました: " + error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// Health check endpoint
export const loader = async () => {
  return new Response(
    JSON.stringify({ status: "ok", endpoint: "import-customer", methods: ["POST"] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

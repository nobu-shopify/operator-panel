import { authenticate } from "../shopify.server";

/**
 * App Proxy endpoint for customer search
 * This route handles requests from the Theme App Extension via App Proxy
 * 
 * App Proxy URL: /apps/operator-panel/customers?query=<search_term>
 */

export const loader = async ({ request }) => {
  // Authenticate the App Proxy request
  const { admin, session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("query") || "";

  if (!searchQuery.trim()) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "検索クエリを入力してください",
        customers: [] 
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Query customers using GraphQL Admin API
    // Using the query filter as documented at:
    // https://shopify.dev/docs/api/admin-graphql/latest/queries/customers
    // Including custom metafields for CS operator panel
    const response = await admin.graphql(
      `#graphql
      query SearchCustomers($query: String!) {
        customers(first: 20, query: $query) {
          nodes {
            id
            firstName
            lastName
            defaultEmailAddress {
              emailAddress
            }
            defaultPhoneNumber {
              phoneNumber
            }
            createdAt
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
            defaultAddress {
              address1
              address2
              city
              company
              country
              countryCodeV2
              firstName
              lastName
              phone
              province
              provinceCode
              zip
            }
            tags
            # Custom metafields for CS operator panel
            cardId: metafield(namespace: "custom", key: "card_id") {
              value
            }
            points: metafield(namespace: "custom", key: "points") {
              value
            }
            gender: metafield(namespace: "custom", key: "gender") {
              value
            }
            customerId: metafield(namespace: "custom", key: "customer_id") {
              value
            }
            birthday: metafield(namespace: "custom", key: "birthday") {
              value
            }
          }
        }
      }`,
      {
        variables: {
          query: searchQuery,
        },
      }
    );

    const data = await response.json();

    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      return new Response(
        JSON.stringify({
          success: false,
          error: "顧客データの取得に失敗しました",
          customers: [],
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const customers = data.data?.customers?.nodes || [];

    return new Response(
      JSON.stringify({
        success: true,
        customers: customers.map((customer) => ({
          id: customer.id,
          firstName: customer.firstName || "",
          lastName: customer.lastName || "",
          email: customer.defaultEmailAddress?.emailAddress || "",
          phone: customer.defaultPhoneNumber?.phoneNumber || "",
          createdAt: customer.createdAt,
          numberOfOrders: customer.numberOfOrders,
          amountSpent: customer.amountSpent,
          defaultAddress: customer.defaultAddress,
          tags: customer.tags || [],
          // Custom metafields
          metafields: {
            cardId: customer.cardId?.value || null,
            points: customer.points?.value ? parseInt(customer.points.value, 10) : null,
            gender: customer.gender?.value || null,
            customerId: customer.customerId?.value || null,
            birthday: customer.birthday?.value || null,
          },
        })),
        totalCount: customers.length,
      }),
      {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Customer search error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "サーバーエラーが発生しました",
        customers: [],
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};


import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// GraphQL query to find existing payment customizations
const GET_PAYMENT_CUSTOMIZATIONS = `#graphql
  query getPaymentCustomizations {
    paymentCustomizations(first: 50) {
      nodes {
        id
        title
        enabled
        functionId
      }
    }
  }
`;

// GraphQL mutation to create payment customization
const CREATE_PAYMENT_CUSTOMIZATION = `#graphql
  mutation createPaymentCustomization($title: String!, $functionHandle: String!, $enabled: Boolean!) {
    paymentCustomizationCreate(paymentCustomization: {
      title: $title
      functionHandle: $functionHandle
      enabled: $enabled
    }) {
      paymentCustomization {
        id
        title
        enabled
        functionId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// GraphQL mutation to update payment customization
const UPDATE_PAYMENT_CUSTOMIZATION = `#graphql
  mutation updatePaymentCustomization($id: ID!, $enabled: Boolean!) {
    paymentCustomizationUpdate(id: $id, paymentCustomization: {
      enabled: $enabled
    }) {
      paymentCustomization {
        id
        title
        enabled
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// GraphQL mutation to delete payment customization
const DELETE_PAYMENT_CUSTOMIZATION = `#graphql
  mutation deletePaymentCustomization($id: ID!) {
    paymentCustomizationDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(GET_PAYMENT_CUSTOMIZATIONS);
    const data = await response.json();
    
    // Find the cc-ivr payment customization
    const customizations = data.data?.paymentCustomizations?.nodes || [];
    const ccIvrCustomization = customizations.find(
      (c) => c.title === "CC IVR - Operator Only" || c.title?.includes("クレカIVR")
    );

    return {
      ccIvrCustomization,
      allCustomizations: customizations,
      error: null,
    };
  } catch (error) {
    console.error("Error fetching payment customizations:", error);
    return {
      ccIvrCustomization: null,
      allCustomizations: [],
      error: error.message,
    };
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  try {
    if (actionType === "create") {
      const response = await admin.graphql(CREATE_PAYMENT_CUSTOMIZATION, {
        variables: {
          title: "CC IVR - Operator Only",
          functionHandle: "cc-ivr",
          enabled: true,
        },
      });
      const data = await response.json();

      if (data.errors) {
        return {
          success: false,
          error: data.errors.map((e) => e.message).join(", "),
        };
      }

      if (data.data?.paymentCustomizationCreate?.userErrors?.length > 0) {
        return {
          success: false,
          error: data.data.paymentCustomizationCreate.userErrors
            .map((e) => `${e.field}: ${e.message}`)
            .join(", "),
        };
      }

      return {
        success: true,
        message: "Payment customization created successfully!",
        customization: data.data?.paymentCustomizationCreate?.paymentCustomization,
      };
    }

    if (actionType === "toggle") {
      const id = formData.get("id");
      const enabled = formData.get("enabled") === "true";

      const response = await admin.graphql(UPDATE_PAYMENT_CUSTOMIZATION, {
        variables: { id, enabled: !enabled },
      });
      const data = await response.json();

      if (data.errors) {
        return {
          success: false,
          error: data.errors.map((e) => e.message).join(", "),
        };
      }

      if (data.data?.paymentCustomizationUpdate?.userErrors?.length > 0) {
        return {
          success: false,
          error: data.data.paymentCustomizationUpdate.userErrors
            .map((e) => `${e.field}: ${e.message}`)
            .join(", "),
        };
      }

      return {
        success: true,
        message: `Payment customization ${!enabled ? "enabled" : "disabled"} successfully!`,
      };
    }

    if (actionType === "delete") {
      const id = formData.get("id");

      const response = await admin.graphql(DELETE_PAYMENT_CUSTOMIZATION, {
        variables: { id },
      });
      const data = await response.json();

      if (data.errors) {
        return {
          success: false,
          error: data.errors.map((e) => e.message).join(", "),
        };
      }

      if (data.data?.paymentCustomizationDelete?.userErrors?.length > 0) {
        return {
          success: false,
          error: data.data.paymentCustomizationDelete.userErrors
            .map((e) => `${e.field}: ${e.message}`)
            .join(", "),
        };
      }

      return {
        success: true,
        message: "Payment customization deleted successfully!",
      };
    }

    return { success: false, error: "Unknown action" };
  } catch (error) {
    console.error("[PaymentFunctions] Error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

export default function PaymentFunctions() {
  const { ccIvrCustomization, allCustomizations, error: loaderError } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [localCustomization, setLocalCustomization] = useState(ccIvrCustomization);

  const isLoading = ["loading", "submitting"].includes(fetcher.state);

  // Update local state when fetcher completes
  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.success) {
        shopify.toast.show(fetcher.data.message);
        setTimeout(() => window.location.reload(), 1000);
      } else if (fetcher.data.error) {
        shopify.toast.show(fetcher.data.error, { isError: true });
      }
    }
  }, [fetcher.data, shopify]);

  const handleCreate = () => {
    fetcher.submit({ actionType: "create" }, { method: "POST" });
  };

  const handleToggle = () => {
    if (!localCustomization) return;
    fetcher.submit(
      {
        actionType: "toggle",
        id: localCustomization.id,
        enabled: String(localCustomization.enabled),
      },
      { method: "POST" }
    );
  };

  const handleDelete = () => {
    if (!localCustomization) return;
    if (confirm("本当にこのペイメントカスタマイゼーションを削除しますか？\nAre you sure you want to delete this payment customization?")) {
      fetcher.submit(
        { actionType: "delete", id: localCustomization.id },
        { method: "POST" }
      );
    }
  };

  return (
    <s-page heading="Payment Functions">
      <s-section heading="クレカIVR Payment Customization">
        <s-paragraph>
          この機能は、オペレーター名がカート属性に設定されている場合のみ「クレカIVR」決済オプションを表示します。
        </s-paragraph>
        <s-paragraph>
          This function shows the "クレカIVR" payment option only when an operator name is set in cart attributes.
        </s-paragraph>

        {loaderError && (
          <s-banner tone="critical" heading="Error">
            <s-paragraph>{loaderError}</s-paragraph>
          </s-banner>
        )}

        <s-card>
          <s-stack gap="base">
            <s-heading>Status</s-heading>
            
            {localCustomization ? (
              <>
                <s-stack direction="inline" gap="tight" alignment="center">
                  <s-badge tone={localCustomization.enabled ? "success" : "info"}>
                    {localCustomization.enabled ? "有効 / Enabled" : "無効 / Disabled"}
                  </s-badge>
                  <s-text>ID: {localCustomization.id}</s-text>
                </s-stack>

                <s-stack direction="inline" gap="base">
                  <s-button
                    onClick={handleToggle}
                    variant={localCustomization.enabled ? "secondary" : "primary"}
                    {...(isLoading ? { loading: true } : {})}
                  >
                    {localCustomization.enabled ? "無効にする / Disable" : "有効にする / Enable"}
                  </s-button>
                  <s-button
                    onClick={handleDelete}
                    variant="tertiary"
                    tone="critical"
                    {...(isLoading ? { loading: true } : {})}
                  >
                    削除 / Delete
                  </s-button>
                </s-stack>
              </>
            ) : (
              <>
                <s-banner tone="warning" heading="未登録 / Not Registered">
                  <s-paragraph>
                    クレカIVRペイメントカスタマイゼーションがまだ登録されていません。
                  </s-paragraph>
                  <s-paragraph>
                    The CC IVR payment customization has not been registered yet.
                  </s-paragraph>
                </s-banner>

                <s-button
                  onClick={handleCreate}
                  variant="primary"
                  {...(isLoading ? { loading: true } : {})}
                >
                  登録する / Register
                </s-button>
              </>
            )}
          </s-stack>
        </s-card>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-stack gap="base">
          <s-paragraph>
            <s-text type="strong">1. Operator Panel</s-text>
          </s-paragraph>
          <s-paragraph>
            オペレーターがOperator Panelで名前を入力すると、カート属性に「operator_name」が設定されます。
          </s-paragraph>

          <s-paragraph>
            <s-text type="strong">2. Payment Function</s-text>
          </s-paragraph>
          <s-paragraph>
            チェックアウト時に「operator_name」属性の有無を確認し、存在しない場合は「クレカIVR」を非表示にします。
          </s-paragraph>

          <s-paragraph>
            <s-text type="strong">3. Result</s-text>
          </s-paragraph>
          <s-paragraph>
            オペレーター経由の注文のみクレカIVRが利用可能になります。
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Requirements">
        <s-unordered-list>
          <s-list-item>
            アプリがデプロイされていること
            <s-text color="subdued"> (shopify app deploy)</s-text>
          </s-list-item>
          <s-list-item>
            「クレカIVR」決済方法がストアに設定されていること
          </s-list-item>
          <s-list-item>
            Operator Panel UIがテーマに配置されていること
          </s-list-item>
        </s-unordered-list>
      </s-section>

      {allCustomizations.length > 0 && (
        <s-section heading="All Payment Customizations">
          <s-card>
            <s-box padding="base" background="subdued" borderRadius="base">
              <pre style={{ margin: 0, fontSize: "12px", overflow: "auto" }}>
                <code>{JSON.stringify(allCustomizations, null, 2)}</code>
              </pre>
            </s-box>
          </s-card>
        </s-section>
      )}

      {/* Error display */}
      {fetcher.data?.error && (
        <s-section heading="Error Details">
          <s-banner tone="critical">
            <s-paragraph>{fetcher.data.error}</s-paragraph>
          </s-banner>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};


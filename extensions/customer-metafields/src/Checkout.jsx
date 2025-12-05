import '@shopify/ui-extensions/preact';
import { render } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";

// Export the extension
export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [customer, setCustomer] = useState(null);
  const [metafields, setMetafields] = useState({});
  const [addressApplied, setAddressApplied] = useState(false);
  const [addressStatus, setAddressStatus] = useState(null);
  const addressAppliedRef = useRef(false);

  useEffect(() => {
    // Access customer from buyerIdentity
    const buyerIdentity = shopify.buyerIdentity;
    
    if (buyerIdentity?.customer) {
      const customerValue = buyerIdentity.customer.value ?? buyerIdentity.customer.current;
      if (customerValue) {
        setCustomer(customerValue);
      }
      
      // Subscribe to customer changes
      buyerIdentity.customer.subscribe?.((customerData) => {
        setCustomer(customerData);
      });
    }

    // Get appMetafields
    const appMetafieldsSignal = shopify.appMetafields;
    if (appMetafieldsSignal) {
      const metafieldValue = appMetafieldsSignal.value ?? appMetafieldsSignal.current;
      if (metafieldValue) {
        processMetafields(metafieldValue);
      }
      
      appMetafieldsSignal.subscribe?.((metafieldEntries) => {
        if (metafieldEntries) {
          processMetafields(metafieldEntries);
        }
      });
    }
  }, []);

  // Apply shipping address when metafields are loaded
  useEffect(() => {
    if (metafields.shipping_address && !addressAppliedRef.current) {
      applyShippingAddress();
    }
  }, [metafields.shipping_address]);

  async function applyShippingAddress() {
    if (addressAppliedRef.current) return;
    
    try {
      let addressData;
      try {
        addressData = typeof metafields.shipping_address === 'string' 
          ? JSON.parse(metafields.shipping_address) 
          : metafields.shipping_address;
      } catch (e) {
        console.error('[Checkout] Failed to parse address:', e);
        return;
      }

      // Check if address data is valid
      if (!addressData || !addressData.address1) {
        return;
      }

      addressAppliedRef.current = true;
      setAddressApplied(true);

      // Apply shipping address change
      // addressData now contains countryCode and provinceCode from the import
      if (shopify.applyShippingAddressChange) {
        const result = await shopify.applyShippingAddressChange({
          type: 'updateShippingAddress',
          address: {
            firstName: addressData.firstName || '',
            lastName: addressData.lastName || '',
            address1: addressData.address1 || '',
            address2: addressData.address2 || '',
            city: addressData.city || '',
            provinceCode: addressData.provinceCode || '',
            zip: addressData.zip || '',
            countryCode: addressData.countryCode || 'JP',
            phone: addressData.phone || '',
            company: addressData.company || '',
          },
        });

        if (result.type === 'success') {
          setAddressStatus('success');
        } else {
          setAddressStatus('error');
          console.error('[Checkout] Failed to apply shipping address:', result);
        }
      }
    } catch (error) {
      console.error('[Checkout] Error applying address:', error);
      setAddressStatus('error');
    }
  }

  function processMetafields(metafieldEntries) {
    if (!metafieldEntries || !Array.isArray(metafieldEntries)) return;
    
    const extracted = {};
    metafieldEntries.forEach((entry) => {
      // Filter for customer metafields in the 'custom' namespace
      if (entry.target?.type === 'customer' && entry.metafield?.namespace === 'custom') {
        extracted[entry.metafield.key] = entry.metafield.value;
      }
    });
    
    setMetafields(extracted);
  }

  // Format birthday date
  function formatDate(dateString) {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    } catch (e) {
      return dateString;
    }
  }

  // If no customer is logged in
  if (!customer) {
    return (
      <s-banner heading={shopify.i18n.translate("bannerTitle")} tone="info">
        <s-text>{shopify.i18n.translate("noCustomer")}</s-text>
      </s-banner>
    );
  }

  return (
    <s-banner heading={shopify.i18n.translate("bannerTitle")} tone="success">
      <s-stack gap="tight">
        {/* Customer Name */}
        <s-stack direction="inline" gap="tight">
          <s-text color="subdued">{shopify.i18n.translate("customerName")}:</s-text>
          <s-text type="emphasis">
            {customer.firstName || ''} {customer.lastName || customer.fullName || ''}
          </s-text>
        </s-stack>

        {/* Email */}
        {customer.email && (
          <s-stack direction="inline" gap="tight">
            <s-text color="subdued">{shopify.i18n.translate("email")}:</s-text>
            <s-text>{customer.email}</s-text>
          </s-stack>
        )}

        {/* Divider */}
        <s-divider />

        {/* Custom Metafields Section */}
        <s-text type="emphasis">{shopify.i18n.translate("metafieldsTitle")}</s-text>

        {/* Card ID */}
        <s-stack direction="inline" gap="tight">
          <s-text color="subdued">{shopify.i18n.translate("cardId")}:</s-text>
          <s-text type="emphasis">{metafields.card_id || '-'}</s-text>
        </s-stack>

        {/* Customer ID (custom metafield) */}
        <s-stack direction="inline" gap="tight">
          <s-text color="subdued">{shopify.i18n.translate("customerId")}:</s-text>
          <s-text>{metafields.customer_id || '-'}</s-text>
        </s-stack>

        {/* Points */}
        <s-stack direction="inline" gap="tight">
          <s-text color="subdued">{shopify.i18n.translate("points")}:</s-text>
          <s-text type="emphasis" tone="success">
            {metafields.points ? Number(metafields.points).toLocaleString() : '0'}
          </s-text>
        </s-stack>

        {/* Gender */}
        <s-stack direction="inline" gap="tight">
          <s-text color="subdued">{shopify.i18n.translate("gender")}:</s-text>
          <s-text>{metafields.gender || '-'}</s-text>
        </s-stack>

        {/* Birthday */}
        <s-stack direction="inline" gap="tight">
          <s-text color="subdued">{shopify.i18n.translate("birthday")}:</s-text>
          <s-text>{formatDate(metafields.birthday)}</s-text>
        </s-stack>

        {/* Ordered For Customer (only shown if set) */}
        {metafields.operator_ordered_for_customer && (
          <>
            <s-divider />
            <s-stack direction="inline" gap="tight">
              <s-text color="subdued">{shopify.i18n.translate("orderedFor")}:</s-text>
              <s-text type="emphasis" tone="critical">
                {metafields.operator_ordered_for_customer}
              </s-text>
            </s-stack>
          </>
        )}

        {/* Address Applied Status */}
        {addressApplied && addressStatus === 'success' && (
          <>
            <s-divider />
            <s-text tone="success">{shopify.i18n.translate("addressApplied")}</s-text>
          </>
        )}
      </s-stack>
    </s-banner>
  );
}

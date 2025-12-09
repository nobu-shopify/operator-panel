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
  const [cartAttributes, setCartAttributes] = useState({});
  const [attributesLoaded, setAttributesLoaded] = useState(false);
  const [addressApplied, setAddressApplied] = useState(false);
  const [addressStatus, setAddressStatus] = useState(null);
  const addressAppliedRef = useRef(false);

  // Check if we have operator order data from cart attributes
  const hasOperatorOrderData = Boolean(
    cartAttributes.operator_order_for_customer_id || 
    cartAttributes.operator_order_for_customer_email ||
    cartAttributes.operator_order_for_customer_name
  );

  useEffect(() => {
    console.log('[Checkout] Extension initializing...');
    console.log('[Checkout] shopify object:', shopify);
    
    // Access customer from buyerIdentity
    const buyerIdentity = shopify.buyerIdentity;
    console.log('[Checkout] buyerIdentity:', buyerIdentity);
    
    if (buyerIdentity?.customer) {
      const customerValue = buyerIdentity.customer.value ?? buyerIdentity.customer.current;
      console.log('[Checkout] Customer value:', customerValue);
      if (customerValue) {
        setCustomer(customerValue);
      }
      
      // Subscribe to customer changes
      buyerIdentity.customer.subscribe?.((customerData) => {
        console.log('[Checkout] Customer changed:', customerData);
        setCustomer(customerData);
      });
    }

    // Get cart/checkout attributes
    console.log('[Checkout] shopify.attributes:', shopify.attributes);
    const attributesSignal = shopify.attributes;
    if (attributesSignal) {
      const attributesValue = attributesSignal.value ?? attributesSignal.current;
      console.log('[Checkout] Initial attributes value:', attributesValue);
      if (attributesValue) {
        processAttributes(attributesValue);
      }
      setAttributesLoaded(true);
      
      attributesSignal.subscribe?.((attrs) => {
        console.log('[Checkout] Attributes changed:', attrs);
        if (attrs) {
          processAttributes(attrs);
        }
      });
    } else {
      console.log('[Checkout] shopify.attributes not available');
      setAttributesLoaded(true);
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

  // Process cart attributes into a usable object
  function processAttributes(attrs) {
    console.log('[Checkout] Processing attributes:', attrs, 'isArray:', Array.isArray(attrs));
    
    const extracted = {};
    
    if (Array.isArray(attrs)) {
      attrs.forEach((attr) => {
        if (attr.key && attr.value) {
          extracted[attr.key] = attr.value;
        }
      });
    } else if (attrs && typeof attrs === 'object') {
      // Handle if attributes come as an object instead of array
      Object.keys(attrs).forEach((key) => {
        if (attrs[key]) {
          extracted[key] = attrs[key];
        }
      });
    }
    
    console.log('[Checkout] Extracted cart attributes:', extracted);
    setCartAttributes(extracted);
  }

  // Apply shipping address when operator order data is available (guest mode)
  useEffect(() => {
    if (!customer && hasOperatorOrderData && !addressAppliedRef.current) {
      // Try to get the full address from JSON attribute
      const addressJson = cartAttributes.operator_order_shipping_address;
      if (addressJson) {
        try {
          const addressData = JSON.parse(addressJson);
          console.log('[Checkout] Parsed shipping address from attributes:', addressData);
          applyShippingAddressFromAttributes(addressData);
        } catch (e) {
          console.error('[Checkout] Failed to parse shipping address JSON:', e);
          // Fallback to individual attributes
          const name = cartAttributes.operator_order_for_customer_name || '';
          const nameParts = name.split(' ');
          const phone = cartAttributes.operator_order_for_customer_phone || '';
          
          if (name || phone) {
            applyShippingAddressFromAttributes({
              firstName: nameParts[0] || '',
              lastName: nameParts.slice(1).join(' ') || '',
              phone: phone,
            });
          }
        }
      }
    }
  }, [customer, cartAttributes, hasOperatorOrderData]);

  // Apply shipping address when metafields are loaded (logged-in mode)
  useEffect(() => {
    if (customer && metafields.shipping_address && !addressAppliedRef.current) {
      applyShippingAddress();
    }
  }, [customer, metafields.shipping_address]);

  async function applyShippingAddressFromAttributes(addressData) {
    if (addressAppliedRef.current) return;
    
    try {
      // Check if we have meaningful address data
      const hasAddressData = addressData.address1 || addressData.firstName || addressData.lastName || addressData.phone;
      if (!hasAddressData) {
        console.log('[Checkout] No meaningful address data to apply');
        return;
      }

      console.log('[Checkout] Applying shipping address from attributes:', addressData);

      addressAppliedRef.current = true;
      setAddressApplied(true);

      // Apply shipping address change
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

        console.log('[Checkout] Address apply result:', result);

        if (result.type === 'success') {
          setAddressStatus('success');
        } else {
          setAddressStatus('error');
          console.error('[Checkout] Failed to apply shipping address:', result);
        }
      } else {
        console.log('[Checkout] applyShippingAddressChange not available');
      }
    } catch (error) {
      console.error('[Checkout] Error applying address:', error);
      setAddressStatus('error');
    }
  }

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

  // Parse shipping address for display
  function getShippingAddressDisplay() {
    const addressJson = cartAttributes.operator_order_shipping_address;
    if (!addressJson) return null;
    
    try {
      const addr = JSON.parse(addressJson);
      const parts = [];
      if (addr.zip) parts.push(`〒${addr.zip}`);
      if (addr.province || addr.city) parts.push(`${addr.province || ''}${addr.city || ''}`);
      if (addr.address1) parts.push(addr.address1);
      if (addr.address2) parts.push(addr.address2);
      return parts.join(' ') || null;
    } catch (e) {
      return null;
    }
  }

  // Guest mode - always show operator panel when no customer is logged in
  if (!customer) {
    const operatorName = cartAttributes.operator_name || '';
    const customerName = cartAttributes.operator_order_for_customer_name || '-';
    const customerEmail = cartAttributes.operator_order_for_customer_email || '-';
    const cardId = cartAttributes.operator_order_for_card_id || '-';
    const customerId = cartAttributes.operator_order_for_customer_code || '-';
    const points = cartAttributes.operator_order_for_points || '0';
    const gender = cartAttributes.operator_order_for_gender || '-';
    const birthday = cartAttributes.operator_order_for_birthday || '';
    const phone = cartAttributes.operator_order_for_customer_phone || '-';
    const shippingAddressDisplay = getShippingAddressDisplay();
    const shopifyCustomerId = cartAttributes.operator_order_for_customer_id || '-';

    // Determine banner tone based on whether we have data
    const bannerTone = hasOperatorOrderData ? "warning" : "info";
    const bannerTitle = hasOperatorOrderData 
      ? shopify.i18n.translate("operatorOrderTitle")
      : shopify.i18n.translate("guestCheckoutTitle");

    return (
      <s-banner heading={bannerTitle} tone={bannerTone}>
        <s-stack gap="tight">
          {/* Operator Order Notice - only show if we have data */}
          {hasOperatorOrderData ? (
            <s-text type="emphasis" tone="warning">
              {shopify.i18n.translate("operatorOrderNotice")}
            </s-text>
          ) : (
            <s-text color="subdued">
              {shopify.i18n.translate("guestCheckoutNotice")}
            </s-text>
          )}

          {/* Operator Name - show if we have operator order data */}
          {hasOperatorOrderData && (
            <s-stack direction="inline" gap="tight">
              <s-text color="subdued">{shopify.i18n.translate("operatorName")}:</s-text>
              <s-text type="emphasis" tone={operatorName ? "success" : "critical"}>
                {operatorName || shopify.i18n.translate("operatorNameNotSet")}
              </s-text>
            </s-stack>
          )}

          <s-divider />

          {/* Customer Name */}
          <s-stack direction="inline" gap="tight">
            <s-text color="subdued">{shopify.i18n.translate("customerName")}:</s-text>
            <s-text type="emphasis">{customerName}</s-text>
          </s-stack>

          {/* Email - Important: highlight that this needs manual entry */}
          <s-stack direction="inline" gap="tight">
            <s-text color="subdued">{shopify.i18n.translate("email")}:</s-text>
            {hasOperatorOrderData && customerEmail !== '-' ? (
              <s-text type="emphasis" tone="critical">{customerEmail}</s-text>
            ) : (
              <s-text>{customerEmail}</s-text>
            )}
          </s-stack>

          {/* Email hint for operator */}
          {hasOperatorOrderData && customerEmail !== '-' && (
            <s-text type="small" color="subdued">
              {shopify.i18n.translate("emailManualEntry")}
            </s-text>
          )}

          {/* Phone */}
          <s-stack direction="inline" gap="tight">
            <s-text color="subdued">{shopify.i18n.translate("phone")}:</s-text>
            <s-text>{phone}</s-text>
          </s-stack>

          {/* Shipping Address */}
          {shippingAddressDisplay && (
            <s-stack direction="inline" gap="tight">
              <s-text color="subdued">{shopify.i18n.translate("shippingAddress")}:</s-text>
              <s-text>{shippingAddressDisplay}</s-text>
            </s-stack>
          )}

          {/* Only show metafields section if we have operator order data */}
          {hasOperatorOrderData && (
            <>
              <s-divider />

              {/* Custom Metafields Section */}
              <s-text type="emphasis">{shopify.i18n.translate("metafieldsTitle")}</s-text>

              {/* Shopify Customer ID */}
              <s-stack direction="inline" gap="tight">
                <s-text color="subdued">{shopify.i18n.translate("shopifyCustomerId")}:</s-text>
                <s-text>{shopifyCustomerId}</s-text>
              </s-stack>

              {/* Card ID */}
              <s-stack direction="inline" gap="tight">
                <s-text color="subdued">{shopify.i18n.translate("cardId")}:</s-text>
                <s-text type="emphasis">{cardId}</s-text>
              </s-stack>

              {/* Customer ID (custom metafield) */}
              <s-stack direction="inline" gap="tight">
                <s-text color="subdued">{shopify.i18n.translate("customerId")}:</s-text>
                <s-text>{customerId}</s-text>
              </s-stack>

              {/* Points */}
              <s-stack direction="inline" gap="tight">
                <s-text color="subdued">{shopify.i18n.translate("points")}:</s-text>
                <s-text type="emphasis" tone="success">
                  {points ? Number(points).toLocaleString() : '0'}
                </s-text>
              </s-stack>

              {/* Gender */}
              <s-stack direction="inline" gap="tight">
                <s-text color="subdued">{shopify.i18n.translate("gender")}:</s-text>
                <s-text>{gender}</s-text>
              </s-stack>

              {/* Birthday */}
              <s-stack direction="inline" gap="tight">
                <s-text color="subdued">{shopify.i18n.translate("birthday")}:</s-text>
                <s-text>{formatDate(birthday)}</s-text>
              </s-stack>
            </>
          )}

          {/* Status Messages */}
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

  // Logged-in customer mode (original behavior)
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

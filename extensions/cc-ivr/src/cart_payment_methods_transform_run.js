// @ts-check

/**
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunInput} CartPaymentMethodsTransformRunInput
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunResult} CartPaymentMethodsTransformRunResult
 */

/**
 * Payment customization function that shows/hides "クレカIVR" payment method
 * based on whether an operator is placing the order.
 * 
 * Logic:
 * - If operator_name cart attribute is present and has a value → show クレカIVR (do nothing)
 * - If operator_name is missing or empty → hide クレカIVR
 * 
 * This ensures クレカIVR is only available when operators are processing orders.
 */

/**
 * @type {CartPaymentMethodsTransformRunResult}
 */
const NO_CHANGES = {
  operations: [],
};

// The name of the payment method to show only for operators
const OPERATOR_ONLY_PAYMENT_METHOD = "クレカIVR";

/**
 * @param {CartPaymentMethodsTransformRunInput} input
 * @returns {CartPaymentMethodsTransformRunResult}
 */
export function cartPaymentMethodsTransformRun(input) {
  // Get operator_name from cart attributes
  const operatorName = input?.cart?.operatorName?.value;
  
  // Check if operator_name is present and has a non-empty value
  const isOperatorOrder = operatorName && operatorName.trim() !== '';
  
  // If this is an operator order, show the payment method (do nothing)
  if (isOperatorOrder) {
    console.error(`[cc-ivr] Operator order detected. Operator: ${operatorName}. Showing ${OPERATOR_ONLY_PAYMENT_METHOD}.`);
    return NO_CHANGES;
  }
  
  // If this is NOT an operator order, hide the クレカIVR payment method
  const paymentMethodToHide = input?.paymentMethods?.find(
    method => method.name === OPERATOR_ONLY_PAYMENT_METHOD
  );
  
  if (!paymentMethodToHide) {
    // Payment method not found, nothing to hide
    console.error(`[cc-ivr] ${OPERATOR_ONLY_PAYMENT_METHOD} payment method not found. No changes needed.`);
    return NO_CHANGES;
  }
  
  console.error(`[cc-ivr] Non-operator order. Hiding ${OPERATOR_ONLY_PAYMENT_METHOD} payment method.`);
  
  return {
    operations: [
      {
        paymentMethodHide: {
          paymentMethodId: paymentMethodToHide.id,
        },
      },
    ],
  };
};
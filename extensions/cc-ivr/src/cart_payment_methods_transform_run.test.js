import { describe, it, expect } from 'vitest';
import { cartPaymentMethodsTransformRun } from './cart_payment_methods_transform_run';

/**
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunResult} CartPaymentMethodsTransformRunResult
 */

describe('cc-ivr payment customization function', () => {
  const mockPaymentMethods = [
    { id: 'gid://shopify/PaymentMethod/1', name: 'クレジットカード' },
    { id: 'gid://shopify/PaymentMethod/2', name: 'クレカIVR' },
    { id: 'gid://shopify/PaymentMethod/3', name: '銀行振込' },
  ];

  it('shows クレカIVR when operator_name is present', () => {
    const result = cartPaymentMethodsTransformRun({
      cart: {
        operatorName: {
          key: 'operator_name',
          value: '山田太郎'
        }
      },
      paymentMethods: mockPaymentMethods
    });
    const expected = /** @type {CartPaymentMethodsTransformRunResult} */ ({ operations: [] });

    expect(result).toEqual(expected);
  });

  it('hides クレカIVR when operator_name is missing', () => {
    const result = cartPaymentMethodsTransformRun({
      cart: {
        operatorName: null
      },
      paymentMethods: mockPaymentMethods
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toEqual({
      paymentMethodHide: {
        paymentMethodId: 'gid://shopify/PaymentMethod/2'
      }
    });
  });

  it('hides クレカIVR when operator_name is empty string', () => {
    const result = cartPaymentMethodsTransformRun({
      cart: {
        operatorName: {
          key: 'operator_name',
          value: ''
        }
      },
      paymentMethods: mockPaymentMethods
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toEqual({
      paymentMethodHide: {
        paymentMethodId: 'gid://shopify/PaymentMethod/2'
      }
    });
  });

  it('hides クレカIVR when operator_name is whitespace only', () => {
    const result = cartPaymentMethodsTransformRun({
      cart: {
        operatorName: {
          key: 'operator_name',
          value: '   '
        }
      },
      paymentMethods: mockPaymentMethods
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toEqual({
      paymentMethodHide: {
        paymentMethodId: 'gid://shopify/PaymentMethod/2'
      }
    });
  });

  it('returns no operations when クレカIVR is not in payment methods', () => {
    const result = cartPaymentMethodsTransformRun({
      cart: {
        operatorName: null
      },
      paymentMethods: [
        { id: 'gid://shopify/PaymentMethod/1', name: 'クレジットカード' },
        { id: 'gid://shopify/PaymentMethod/3', name: '銀行振込' },
      ]
    });

    expect(result.operations).toHaveLength(0);
  });
});
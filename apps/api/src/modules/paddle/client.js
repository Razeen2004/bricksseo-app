import { env } from '../../config/env.js';

const PADDLE_BASE_URL = env.PADDLE_ENV === 'sandbox' 
  ? 'https://sandbox-api.paddle.com' 
  : 'https://api.paddle.com';

async function fetchPaddle(method, endpoint, body = null) {
  const url = `${PADDLE_BASE_URL}${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${env.PADDLE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Paddle API Error ${response.status} at ${url}: ${errText}`);
  }

  const data = await response.json();
  return data.data;
}

export const paddleClient = {
  async getCustomer(customerId) {
    return await fetchPaddle('GET', `/customers/${customerId}`);
  },
  
  async getSubscription(subscriptionId) {
    return await fetchPaddle('GET', `/subscriptions/${subscriptionId}`);
  },
  
  async cancelSubscription(subscriptionId, effectiveFrom = 'next_billing_period') {
    return await fetchPaddle('POST', `/subscriptions/${subscriptionId}/cancel`, { effective_from: effectiveFrom });
  },
  
  async createPortalSession(customerId, subscriptionIds) {
    return await fetchPaddle('POST', `/customers/${customerId}/portal-sessions`, { subscription_ids: subscriptionIds });
  },

  async getTransactionInvoice(transactionId) {
    return await fetchPaddle('GET', `/transactions/${transactionId}/invoice`);
  }
};

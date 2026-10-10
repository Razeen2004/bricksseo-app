import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import Logo from '../../components/ui/Logo';

const PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js';

function loadPaddleJs() {
  if (window.Paddle) return Promise.resolve(window.Paddle);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PADDLE_JS;
    script.async = true;
    script.onload = () => resolve(window.Paddle);
    script.onerror = () => reject(new Error('Could not load the Paddle checkout script.'));
    document.head.appendChild(script);
  });
}

function planLine(plan) {
  if (plan.interval === 'lifetime') return 'One-time payment, unlimited sites';
  const sites = plan.siteLimit ? `${plan.siteLimit} site${plan.siteLimit > 1 ? 's' : ''}` : 'Unlimited sites';
  return `${sites}, billed yearly`;
}

export default function PayPage() {
  const [searchParams] = useSearchParams();
  const preselected = searchParams.get('plan');
  const [paddleReady, setPaddleReady] = useState(false);
  const [error, setError] = useState(null);
  const autoOpened = useRef(false);

  const { data, isLoading, error: configError } = useQuery({
    queryKey: ['checkout-config'],
    queryFn: () => apiFetch('/public/checkout-config')
  });

  useEffect(() => {
    if (!data) return;
    if (!data.clientToken) {
      setError('Checkout is not configured yet (missing Paddle client token).');
      return;
    }
    loadPaddleJs()
      .then((Paddle) => {
        if (data.environment === 'sandbox') Paddle.Environment.set('sandbox');
        Paddle.Initialize({ token: data.clientToken });
        setPaddleReady(true);
      })
      .catch((err) => setError(err.message));
  }, [data]);

  const openCheckout = (plan) => {
    setError(null);
    window.Paddle.Checkout.open({
      items: [{ priceId: plan.priceId, quantity: 1 }],
      settings: {
        displayMode: 'overlay',
        theme: 'dark',
        ...(data?.successUrl ? { successUrl: data.successUrl } : {})
      }
    });
  };

  useEffect(() => {
    if (!paddleReady || !preselected || autoOpened.current) return;
    const plan = data?.plans.find((p) => p.code === preselected);
    if (plan) {
      autoOpened.current = true;
      openCheckout(plan);
    }
  }, [paddleReady, preselected, data]);

  // If the link named a real plan, show only that plan. Falls back to the
  // full list below when the plan code is missing or doesn't match anything.
  const selectedPlan = preselected ? data?.plans.find((p) => p.code === preselected) : null;
  const visiblePlans = selectedPlan ? [selectedPlan] : (data?.plans ?? []);

  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-12 font-sans text-ink">
      <Logo className="mb-8" />

      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-8">
        <h1 className="text-center font-serif text-3xl italic">
          {selectedPlan ? `Get ${selectedPlan.name}.` : 'Choose your plan.'}
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          {selectedPlan ? 'Continue to secure checkout.' : 'Pick a plan to continue to secure checkout.'}
        </p>

        {(error || configError) && (
          <div className="mt-6 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error || configError.message}
          </div>
        )}

        {isLoading && <p className="mt-6 text-center text-sm text-muted">Loading plans...</p>}

        {data && visiblePlans.length === 0 && (
          <p className="mt-6 text-center text-sm text-muted">No plans are available yet.</p>
        )}

        <div className="mt-6 space-y-3">
          {visiblePlans.map((plan) => (
            <div key={plan.code} className="flex items-center justify-between rounded-xl border border-border px-5 py-4">
              <div>
                <p className="font-medium">{plan.name}</p>
                <p className="text-sm text-muted">{planLine(plan)}</p>
              </div>
              <button
                type="button"
                disabled={!paddleReady}
                onClick={() => openCheckout(plan)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Buy {plan.name}
              </button>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-8 text-sm text-muted">
        Need help? contact <a href="mailto:support@bricksseo.com" className="text-accent-hover hover:underline">support@bricksseo.com</a>
      </p>
    </div>
  );
}

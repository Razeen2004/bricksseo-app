import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
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
  const [completed, setCompleted] = useState(false);
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
        Paddle.Initialize({
          token: data.clientToken,
          eventCallback: (event) => {
            if (event.name === 'checkout.completed') setCompleted(true);
          }
        });
        setPaddleReady(true);
      })
      .catch((err) => setError(err.message));
  }, [data]);

  const openCheckout = (plan) => {
    setError(null);
    window.Paddle.Checkout.open({
      items: [{ priceId: plan.priceId, quantity: 1 }],
      settings: { displayMode: 'overlay', theme: 'dark' }
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

  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-12 font-sans text-ink">
      <Logo className="mb-8" />

      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-8">
        {completed ? (
          <div className="text-center">
            <h1 className="font-serif text-3xl italic">Thank you.</h1>
            <p className="mt-3 text-sm text-muted">
              Your payment went through. We are creating your license now; your login details and license key will arrive by email in a minute or two.
            </p>
            <Link to="/login" className="mt-6 inline-block text-sm text-accent-hover hover:underline">Go to login</Link>
          </div>
        ) : (
          <>
            <h1 className="text-center font-serif text-3xl italic">Choose your plan.</h1>
            <p className="mt-2 text-center text-sm text-muted">Pick a plan to continue to secure checkout.</p>

            {(error || configError) && (
              <div className="mt-6 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {error || configError.message}
              </div>
            )}

            {isLoading && <p className="mt-6 text-center text-sm text-muted">Loading plans...</p>}

            {data && data.plans.length === 0 && (
              <p className="mt-6 text-center text-sm text-muted">No plans are available yet.</p>
            )}

            <div className="mt-6 space-y-3">
              {data?.plans.map((plan) => (
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
          </>
        )}
      </div>

      <p className="mt-8 text-sm text-muted">
        Need help? contact <a href="mailto:support@bricksseo.com" className="text-accent-hover hover:underline">support@bricksseo.com</a>
      </p>
    </div>
  );
}

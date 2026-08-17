import React, { useEffect, useState } from 'react';
import LicenseService from '../services/LicenseService';
import { useLicense } from '../context/LicenseContext';
import DonateButton from '../components/DonateButton';
import PlanComparison from '../components/PlanComparison';
import { headlinePrice, chargedNote, priceLabel } from '../utils/planPricing';
import './Pro.css';

const PLAN_LABELS = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  api: 'API for QA',
};

const Pro = () => {
  const { license, activate } = useLicense();
  const [plans, setPlans] = useState([]);
  const [currency, setCurrency] = useState('UAH');
  const [restoreKey, setRestoreKey] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState(null);
  const [apiKeyDays, setApiKeyDays] = useState(null);
  const [tiers, setTiers] = useState(null);

  useEffect(() => {
    LicenseService.listPlans()
      .then((payload) => {
        setPlans(payload.plans || []);
        setCurrency(payload.currency || 'UAH');
        setTiers(payload.tiers || null);
      })
      .catch((err) => setError(err.message));
  }, []);

  const labelFor = (planId, period) =>
    priceLabel(plans.find((item) => item.id === planId), currency, period);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderReference = params.get('orderReference');
    if (!orderReference) {
      return undefined;
    }
    // The reference can hand out the license key, so keep it out of history, referrers and
    // anything the ad scripts on the page report as the current URL.
    window.history.replaceState({}, '', window.location.pathname);
    let cancelled = false;
    LicenseService.fetchPaidOrder(orderReference).then((paid) => {
      if (!cancelled && paid?.licenseKey) {
        activate(paid.licenseKey);
        if (paid.apiKey || paid.data?.apiKey) {
          setApiKey(paid.apiKey || paid.data.apiKey);
          setApiKeyDays(paid.apiKeyRemainingDays || paid.data?.apiKeyRemainingDays || null);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activate]);

  const handleCheckout = async (plan) => {
    setError(null);
    setBusy(true);
    try {
      const checkout = await LicenseService.checkout(plan.plan, plan.type);
      LicenseService.submitWayforpayCheckout(checkout);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const handleIssueApiKey = async () => {
    setError(null);
    setBusy(true);
    try {
      const issued = await LicenseService.requestApiKey(license.key);
      setApiKey(issued.apiKey);
      setApiKeyDays(issued.remainingDays);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await activate(restoreKey.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pro-page">
      <h1>Hide Mail Pro</h1>
      <p>
        Pay with Visa, Mastercard, Apple Pay or Google Pay. No account: you get a license key
        to paste on any browser. PayPal stays as a last-resort donate on this page only.
      </p>

      {license?.active ? (
        <div className="pro-active" data-testid="pro-active">
          <p data-testid="pro-days-left">
            {license.remainingDays ?? Math.max(0, Math.ceil((license.expiresAt - Date.now()) / 86400000))} days left
          </p>
          <p>Pro is active until {new Date(license.expiresAt).toLocaleDateString()}.</p>
          <p className="pro-key-label">Save this key:</p>
          <code data-testid="pro-license-key">{license.key}</code>
          {apiKey ? (
            <p>
              API key
              {apiKeyDays !== null ? ` (${apiKeyDays} days left)` : ' (30 days)'}:
              {' '}
              <code data-testid="pro-api-key">{apiKey}</code>
            </p>
          ) : null}
          {license.type === 'api' ? (
            <button type="button" disabled={busy} onClick={handleIssueApiKey}>
              {apiKey ? 'Replace API key' : 'Get a new API key'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="pro-plans">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            className={`pro-plan ${plan.id === 'yearly' ? 'pro-plan-featured' : ''}`}
            disabled={busy}
            onClick={() => handleCheckout(plan)}
          >
            <strong>{PLAN_LABELS[plan.id] || plan.id}</strong>
            <span>{headlinePrice(plan)}</span>
            <small>{chargedNote(plan, currency)}</small>
            <small>{plan.id === 'yearly' ? 'billed once a year' : 'billed every month'}</small>
          </button>
        ))}
      </div>
      <p className="pro-recurring-note">
        Plans renew automatically until you cancel. Write to us to cancel or ask for a refund.
      </p>

      <form className="pro-restore" onSubmit={handleRestore}>
        <label htmlFor="license-key">Already paid? Paste your key</label>
        <input
          id="license-key"
          value={restoreKey}
          onChange={(event) => setRestoreKey(event.target.value)}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !restoreKey.trim()}>Restore</button>
      </form>

      {error ? <p className="pro-error" role="alert">{error}</p> : null}

      {tiers ? (
        <PlanComparison
          tiers={tiers}
          price={{
            pro: labelFor('monthly', 'per month'),
            api: labelFor('api', 'per month'),
          }}
        />
      ) : null}

      <div className="pro-paypal-last-resort">
        <p>Cannot pay by card? Last-resort PayPal donate only:</p>
        <DonateButton />
      </div>
    </div>
  );
};

export default Pro;

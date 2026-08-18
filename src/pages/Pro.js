import React, { useEffect, useState } from 'react';
import LicenseService from '../services/LicenseService';
import { useLicense } from '../context/LicenseContext';
import DonateButton from '../components/DonateButton';
import PlanComparison from '../components/PlanComparison';
import {
  headlinePrice,
  chargedNote,
  priceLabel,
  displayCurrencies,
  readStoredCurrency,
  storeCurrency,
} from '../utils/planPricing';
import './Pro.css';

const PLAN_LABELS = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  api: 'API for QA',
};

const Pro = () => {
  const { license, activate } = useLicense();
  const [plans, setPlans] = useState([]);
  const [fx, setFx] = useState({ usdRate: null, rates: {} });
  const [displayCurrency, setDisplayCurrency] = useState(readStoredCurrency);
  const [restoreKey, setRestoreKey] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState(null);
  const [apiKeyDays, setApiKeyDays] = useState(null);
  const [tiers, setTiers] = useState(null);

  const currencies = displayCurrencies(fx.rates);

  useEffect(() => {
    LicenseService.listPlans()
      .then((payload) => {
        setPlans(payload.plans || []);
        setFx({
          usdRate: payload.usdRate,
          rates: payload.rates || {},
        });
        setTiers(payload.tiers || null);
        const allowed = displayCurrencies(payload.rates);
        setDisplayCurrency((current) => (allowed.includes(current) ? current : 'USD'));
      })
      .catch((err) => {
        setPlans([]);
        setError(err.message);
      });
  }, []);

  const labelFor = (planId, period) =>
    priceLabel(plans.find((item) => item.id === planId), displayCurrency, period, fx);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoffToken = params.get('handoffToken');
    if (!handoffToken) {
      return undefined;
    }
    // The reference can hand out the license key, so keep it out of history, referrers and
    // anything the ad scripts on the page report as the current URL.
    window.history.replaceState({}, '', window.location.pathname);
    let cancelled = false;
    LicenseService.fetchPaidOrder(handoffToken).then((paid) => {
      if (cancelled) {
        return;
      }
      if (paid?.licenseKey) {
        activate(paid.licenseKey);
        if (paid.apiKey || paid.data?.apiKey) {
          setApiKey(paid.apiKey || paid.data.apiKey);
          setApiKeyDays(paid.apiKeyRemainingDays || paid.data?.apiKeyRemainingDays || null);
        }
      } else if (!paid?.licenseKey && paid?.data && !paid.data.paidAt) {
        const token = handoffToken;
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('handoffToken', token);
        window.history.replaceState({}, '', newUrl.toString());
      }
    }).catch(() => {
      const token = handoffToken;
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('handoffToken', token);
      window.history.replaceState({}, '', newUrl.toString());
    });
    return () => {
      cancelled = true;
    };
  }, [activate]);

  const handleCurrencyChange = (event) => {
    const next = event.target.value;
    storeCurrency(next);
    setDisplayCurrency(next);
  };

  const handleCheckout = async (plan) => {
    setError(null);
    setBusy(true);
    try {
      const checkout = await LicenseService.checkout(plan.plan, plan.type, displayCurrency);
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

      {plans.length > 0 ? (
        <>
          <label className="pro-currency" htmlFor="display-currency">
            Display currency
            <select
              id="display-currency"
              value={currencies.includes(displayCurrency) ? displayCurrency : 'USD'}
              onChange={handleCurrencyChange}
            >
              {currencies.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </label>
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
                <span>{headlinePrice(plan, displayCurrency, fx)}</span>
                <small>{chargedNote(plan)}</small>
                <small>{plan.id === 'yearly' ? 'billed once a year' : 'billed every month'}</small>
              </button>
            ))}
          </div>
          <p className="pro-recurring-note">
            Your card is charged the UAH amount. Other currencies are a converted display;
            if your card is not in hryvnia, your bank converts from UAH.
          </p>
          <p className="pro-recurring-note">
            Plans renew automatically until you cancel. Write to us to cancel or ask for a refund.
          </p>
        </>
      ) : null}

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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import LicenseService from '../services/LicenseService';
import { useLicense } from '../context/LicenseContext';
import DonateButton from '../components/DonateButton';
import PlanComparison from '../components/PlanComparison';
import LicenseKeyCopy from '../components/LicenseKeyCopy';
import {
  priceLabel,
  displayCurrencies,
  readStoredCurrency,
  storeCurrency,
} from '../utils/planPricing';
import './Pro.css';

const remainingDaysOf = (item) => {
  if (typeof item.remainingDays === 'number') {
    return item.remainingDays;
  }
  if (item.expiresAt) {
    return Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 86400000));
  }
  return 0;
};

const HANDOFF_POLL_MS = 1000;
const HANDOFF_POLL_ATTEMPTS = 18;
const HANDOFF_STORAGE_KEY = 'hidemail_handoff_token';

const MCP_SNIPPET = `{
  "mcpServers": {
    "hide-mail": {
      "url": "https://hide-mail.org/api/mcp",
      "headers": {
        "X-API-Key": "hm_live_..."
      }
    }
  }
}`;

const readHandoffToken = () => {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('handoffToken') || params.get('handoff_token');
  if (fromUrl) {
    sessionStorage.setItem(HANDOFF_STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(HANDOFF_STORAGE_KEY);
};

const clearHandoffToken = () => {
  sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const Pro = () => {
  const { license, activate } = useLicense();
  const [plans, setPlans] = useState([]);
  const [fx, setFx] = useState({ usdRate: null, rates: {} });
  const [displayCurrency, setDisplayCurrency] = useState(readStoredCurrency);
  const [tiers, setTiers] = useState(null);
  const [restoreKey, setRestoreKey] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState(null);
  const [apiKeyDays, setApiKeyDays] = useState(null);
  const [issuedLicense, setIssuedLicense] = useState(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const successDialogRef = useRef(null);

  const currencies = displayCurrencies(fx.rates);

  useEffect(() => {
    let cancelled = false;
    const promise = typeof LicenseService.listPlans === 'function'
      ? LicenseService.listPlans()
      : null;
    if (!promise || typeof promise.then !== 'function') {
      return undefined;
    }
    promise
      .then((payload) => {
        if (cancelled || !payload) {
          return;
        }
        setPlans(payload.plans || []);
        setFx({
          usdRate: payload.usdRate,
          rates: payload.rates || {},
        });
        setTiers(payload.tiers || null);
        const allowed = displayCurrencies(payload.rates);
        setDisplayCurrency((current) => (allowed.includes(current) ? current : 'USD'));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const labelFor = (planId, period, fallbackUsd) => {
    const found = plans.find((item) => item.id === planId);
    if (found) {
      return priceLabel(found, displayCurrency, period, fx);
    }
    return fallbackUsd ? `$${fallbackUsd} ${period}` : '—';
  };

  const handleCurrencyChange = (event) => {
    const next = event.target.value;
    storeCurrency(next);
    setDisplayCurrency(next);
  };

  useEffect(() => {
    if (license?.active) {
      clearHandoffToken();
      setConfirmingPayment(false);
      return undefined;
    }
    const handoffToken = readHandoffToken();
    if (!handoffToken) {
      return undefined;
    }
    // The reference can hand out the license key, so keep it out of history, referrers and
    // anything the ad scripts on the page report as the current URL.
    window.history.replaceState({}, '', window.location.pathname);
    let cancelled = false;
    setConfirmingPayment(true);

    const restoreHandoffInUrl = () => {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('handoffToken', handoffToken);
      window.history.replaceState({}, '', newUrl.toString());
    };

    (async () => {
      let paid = null;
      for (let attempt = 0; attempt < HANDOFF_POLL_ATTEMPTS; attempt += 1) {
        if (cancelled) {
          return;
        }
        try {
          paid = await LicenseService.fetchPaidOrder(handoffToken);
        } catch {
          paid = null;
        }
        if (paid?.licenseKey) {
          break;
        }
        if (attempt < HANDOFF_POLL_ATTEMPTS - 1) {
          await sleep(HANDOFF_POLL_MS);
        }
      }
      if (cancelled) {
        return;
      }
      if (paid?.licenseKey) {
        clearHandoffToken();
        try {
          const payload = await activate(paid.licenseKey);
          if (cancelled) {
            return;
          }
          setIssuedLicense(payload.license);
          if (paid.apiKey || paid.data?.apiKey) {
            setApiKey(paid.apiKey || paid.data.apiKey);
            setApiKeyDays(paid.apiKeyRemainingDays || paid.data?.apiKeyRemainingDays || null);
          }
          setConfirmingPayment(false);
        } catch (err) {
          setConfirmingPayment(false);
          setError(err.message);
          restoreHandoffInUrl();
        }
        return;
      }
      setConfirmingPayment(false);
      setError('Payment is still confirming. Refresh this page in a moment.');
      restoreHandoffInUrl();
    })();

    return () => {
      cancelled = true;
    };
  }, [activate, license?.active]);

  const copyLicenseKey = useCallback((key) => {
    navigator.clipboard.writeText(key).then(() => {
      setKeyCopied(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (issuedLicense?.key) {
      copyLicenseKey(issuedLicense.key);
    }
  }, [issuedLicense, copyLicenseKey]);

  const bindSuccessDialog = useCallback((dialog) => {
    successDialogRef.current = dialog;
    if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal();
    }
  }, []);

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

  const showSupport = !confirmingPayment && !license?.active;

  return (
    <div className="pro-page">
      <h1>Hide Mail Pro</h1>
      {confirmingPayment ? (
        <p className="pro-confirming" role="status">Confirming payment…</p>
      ) : !license?.active ? (
        <p>
          Card checkout is paused. Ads keep the inbox free. Support Hide Mail with PayPal,
          or paste an existing license key.
        </p>
      ) : null}

      {issuedLicense ? (
        <dialog
          ref={bindSuccessDialog}
          className="pro-success-dialog"
          closedby="any"
          aria-labelledby="pro-success-title"
        >
          <h2 id="pro-success-title">Payment successful — Pro is active</h2>
          <p>
            Your license key lasts {remainingDaysOf(issuedLicense)} days
            {issuedLicense.expiresAt
              ? ` (until ${new Date(issuedLicense.expiresAt).toLocaleDateString()})`
              : ''}.
          </p>
          <p className="pro-key-label">Save this key. We cannot email it to you.</p>
          <LicenseKeyCopy
            licenseKey={issuedLicense.key}
            copied={keyCopied}
            onCopy={copyLicenseKey}
            testId="pro-success-key"
          />
          <Link className="pro-success-home" to="/">Go to your inbox</Link>
          <form method="dialog">
            <button type="submit">Stay on this page</button>
          </form>
        </dialog>
      ) : null}

      {license?.active ? (
        <div className="pro-active" data-testid="pro-active">
          <p className="pro-active-status">Pro is active</p>
          <p data-testid="pro-days-left">
            {remainingDaysOf(license)} days left
          </p>
          {license.expiresAt ? (
            <p>Pro is active until {new Date(license.expiresAt).toLocaleDateString()}.</p>
          ) : null}
          <p className="pro-key-label">Save this key:</p>
          <LicenseKeyCopy
            licenseKey={license.key}
            copied={keyCopied}
            onCopy={copyLicenseKey}
            testId="pro-license-key"
          />
          {apiKey ? (
            <p>
              API key
              {apiKeyDays !== null ? ` (${apiKeyDays} days left)` : ' (30 days)'}:
              {' '}
              <code data-testid="pro-api-key">{apiKey}</code>
            </p>
          ) : null}
          {['api', 'suite', 'grade', 'sender', 'reports', 'bounce', 'complaint', 'invite'].includes(license.type) ? (
            <button type="button" disabled={busy} onClick={handleIssueApiKey}>
              {apiKey ? 'Replace API key' : 'Get a new API key'}
            </button>
          ) : null}
        </div>
      ) : null}

      {showSupport ? (
        <div className="pro-paypal">
          <p>Support Hide Mail with PayPal:</p>
          <DonateButton />
        </div>
      ) : null}

      {showSupport ? (
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
      ) : null}

      {error ? <p className="pro-error" role="alert">{error}</p> : null}

      {showSupport && tiers ? (
        <>
          {currencies.length > 1 ? (
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
          ) : null}
          <PlanComparison
            tiers={{
              ...tiers,
              suite: tiers.suite || tiers.api,
            }}
            price={{
              pro: labelFor('monthly', 'per month', '3.49'),
              api: labelFor('api', 'per month', '7.99'),
              suite: labelFor('suite', 'per month', '19.99'),
            }}
          />
        </>
      ) : null}

      <section className="pro-mcp-onboarding" aria-labelledby="pro-mcp-title">
        <h2 id="pro-mcp-title">Connect via MCP (Claude / Cursor / Antigravity)</h2>
        <p>
          Point your AI coding assistant or agent at the Official Hide Mail MCP endpoint using your
          Deliverability Suite, QA API, or standalone tool API key.{' '}
          <Link to="/developers">Open Interactive API Explorer</Link>
          {' · '}
          <Link to="/developers?tab=mcp">Explore all 10 MCP Tools &amp; Live RPC Tester</Link>.
        </p>
        <pre className="tool-mcp-preview" data-testid="mcp-config-snippet">
          <code>{MCP_SNIPPET}</code>
        </pre>
      </section>
    </div>
  );
};

export default Pro;

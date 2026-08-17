import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import LicenseService from '../services/LicenseService';

const LicenseContext = createContext({
  license: null,
  entitlements: null,
  isPro: false,
  activate: async () => {},
  clear: () => {},
});

export const LicenseProvider = ({ children }) => {
  const [license, setLicense] = useState(null);
  const [entitlements, setEntitlements] = useState(null);

  const applyPayload = (payload) => {
    if (!payload?.license) {
      setLicense(null);
      setEntitlements(null);
      return;
    }
    setLicense(payload.license);
    setEntitlements(payload.entitlements || null);
  };

  useEffect(() => {
    let cancelled = false;
    LicenseService.restoreSaved().then((payload) => {
      if (!cancelled) {
        applyPayload(payload);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({
    license,
    entitlements,
    isPro: Boolean(license && entitlements && entitlements.ads === false),
    activate: async (key) => {
      const payload = await LicenseService.restore(key);
      applyPayload(payload);
      return payload;
    },
    clear: () => {
      LicenseService.clearKey();
      setLicense(null);
      setEntitlements(null);
    },
  }), [license, entitlements]);

  return (
    <LicenseContext.Provider value={value}>
      {children}
    </LicenseContext.Provider>
  );
};

LicenseProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useLicense = () => useContext(LicenseContext);

export default LicenseContext;

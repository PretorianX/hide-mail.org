import React, { useState, useEffect } from 'react';
import { validateConfig } from '../utils/configValidator';
import ConfigError from './ConfigError';

function ConfigProvider({ children }) {
  const [configError, setConfigError] = useState(null);
  const [configValid, setConfigValid] = useState(false);

  useEffect(() => {
    try {
      validateConfig();
      setConfigValid(true);
    } catch (error) {
      setConfigError(error.message);
    }
  }, []);

  if (configError) {
    return <ConfigError message={configError} />;
  }

  if (!configValid) {
    return <div>Validating configuration...</div>;
  }

  return <>{children}</>;
}

export default ConfigProvider; 
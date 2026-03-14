import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchConfig } from '../services/api';

export default function useConfig() {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const configNameParam = searchParams.get('config') || 'default';
  const logParam = searchParams.get('log');
  const accessKeyParam = searchParams.get('key') || null;

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchConfig(configNameParam);
        if (!cancelled) {
          setConfig(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              err.message ||
              'Failed to load configuration'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [configNameParam]);

  const defaults = config?.defaults || {};
  const loggingEnabled =
    logParam !== null ? logParam === 'true' : (defaults.log ?? false);

  const accessKey =
    accessKeyParam && accessKeyParam === config?.access_key
      ? accessKeyParam
      : null;

  return {
    config,
    loading,
    error,
    configName: configNameParam,
    accessKey,
    loggingEnabled,
  };
}

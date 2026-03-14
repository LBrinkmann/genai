import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchConfig, validateKey } from '../services/api';

export default function useConfig() {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessKey, setAccessKey] = useState(null);

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

  useEffect(() => {
    let cancelled = false;

    async function checkKey() {
      if (!accessKeyParam) {
        setAccessKey(null);
        return;
      }
      try {
        const result = await validateKey(accessKeyParam);
        if (!cancelled) {
          setAccessKey(result.valid ? accessKeyParam : null);
        }
      } catch {
        if (!cancelled) {
          setAccessKey(null);
        }
      }
    }

    checkKey();
    return () => {
      cancelled = true;
    };
  }, [accessKeyParam]);

  const defaults = config?.defaults || {};
  const loggingEnabled =
    logParam !== null ? logParam === 'true' : (defaults.log ?? false);

  return {
    config,
    loading,
    error,
    configName: configNameParam,
    accessKey,
    loggingEnabled,
  };
}

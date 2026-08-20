import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchConfig } from '../services/api';

export default function useConfig() {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // An explicit ?config= pins a specific feedback config. Without one,
  // we follow the server's *active* config: fetch the baseline, then
  // honour its `defaults.config` (which the admin "which bots answer"
  // toggle pins via active_feedback_config). This is what makes the
  // toggle actually change how many bots the chat shows — otherwise
  // the page is stuck on the single-bot "default" config regardless.
  const explicitConfig = searchParams.get('config');
  const configNameParam = explicitConfig || 'default';
  const logParam = searchParams.get('log');
  // The config actually loaded (may differ from configNameParam when
  // we follow defaults.config). Drives session naming + health polls.
  const [activeConfigName, setActiveConfigName] =
    useState(configNameParam);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig(showSpinner = true) {
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        let data = await fetchConfig(configNameParam);
        // Follow the active config only when the URL didn't pin one.
        if (!explicitConfig) {
          const active = data?.defaults?.config;
          if (active && active !== configNameParam) {
            data = await fetchConfig(active);
          }
        }
        if (!cancelled) {
          setConfig(data);
          setActiveConfigName(data?.name || configNameParam);
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
        if (!cancelled && showSpinner) {
          setLoading(false);
        }
      }
    }

    loadConfig(true);

    // Refetch silently when the tab becomes visible — picks up admin
    // overrides made in another tab without a full reload.
    const onVisible = () => {
      if (!document.hidden) loadConfig(false);
    };
    document.addEventListener('visibilitychange', onVisible);

    // Refetch immediately when the admin changes the active config in
    // this same tab (e.g. the header "which bots answer" toggle), so
    // the chat reflects the new bot set without a manual reload.
    const onConfigChanged = () => loadConfig(false);
    window.addEventListener('genai:config-changed', onConfigChanged);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(
        'genai:config-changed',
        onConfigChanged
      );
    };
  }, [configNameParam, explicitConfig]);

  const defaults = config?.defaults || {};
  const loggingEnabled =
    logParam !== null ? logParam === 'true' : (defaults.log ?? false);

  // Visible/context caps (D4). Safe defaults preserve existing config
  // payloads that don't yet declare these fields.
  const visibleLimit =
    typeof config?.visible_limit === 'number'
      ? config.visible_limit
      : 3;
  const contextLimit =
    typeof config?.context_limit === 'number'
      ? config.context_limit
      : null;
  // Debug-only parallel mode, driven by the admin override layer.
  // Absent on older config payloads, so default to off.
  const testMode = config?.test_mode === true;

  return {
    config,
    loading,
    error,
    configName: activeConfigName,
    loggingEnabled,
    visibleLimit,
    contextLimit,
    testMode,
  };
}

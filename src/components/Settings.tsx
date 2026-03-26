import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SettingsProps {
  open: boolean;
  onClose: () => void;
}

interface AgentApiSettings {
  enabled: boolean;
  port: number;
  autoApprove: boolean;
  hasToken: boolean;
  tokenPreview?: string | null;
  running: boolean;
}

interface SaveAgentApiSettingsResponse {
  settings: AgentApiSettings;
  generatedToken?: string | null;
}

interface RegenerateTokenResponse {
  token: string;
  settings: AgentApiSettings;
}

function toFormState(settings: AgentApiSettings) {
  return {
    enabled: settings.enabled,
    port: settings.port,
    autoApprove: settings.autoApprove,
  };
}

export function Settings({ open, onClose }: SettingsProps) {
  const [settings, setSettings] = useState<AgentApiSettings | null>(null);
  const [form, setForm] = useState({ enabled: false, port: 21345, autoApprove: false });
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopyNotice(null);
    try {
      const next = await invoke<AgentApiSettings>("agent_get_settings");
      setSettings(next);
      setForm(toFormState(next));
      setGeneratedToken(null);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadSettings();
  }, [open, loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setCopyNotice(null);
    try {
      const response = await invoke<SaveAgentApiSettingsResponse>(
        "agent_save_settings",
        { input: form }
      );
      setSettings(response.settings);
      setForm(toFormState(response.settings));
      setGeneratedToken(response.generatedToken ?? null);
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateToken = async () => {
    setSaving(true);
    setError(null);
    setCopyNotice(null);
    try {
      const response = await invoke<RegenerateTokenResponse>("agent_regenerate_token");
      setSettings(response.settings);
      setForm(toFormState(response.settings));
      setGeneratedToken(response.token);
    } catch (regenerateError) {
      setError(String(regenerateError));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyToken = async () => {
    if (!generatedToken) {
      return;
    }
    setCopyNotice(null);
    try {
      await navigator.clipboard.writeText(generatedToken);
      setCopyNotice("Token copied");
    } catch (copyError) {
      setCopyNotice(`Copy failed: ${String(copyError)}`);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-header">
          <span className="settings-title">Agent API</span>
          <button type="button" className="settings-close" onClick={onClose}>
            x
          </button>
        </div>

        {loading && <div className="settings-note">Loading settings...</div>}

        {!loading && settings && (
          <>
            <label className="settings-field settings-checkbox">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              <span>Enable Agent API</span>
            </label>

            <label className="settings-field">
              <span>Port</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    port: Number(event.target.value) || 0,
                  }))
                }
              />
            </label>

            <label className="settings-field settings-checkbox">
              <input
                type="checkbox"
                checked={form.autoApprove}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, autoApprove: event.target.checked }))
                }
              />
              <span>Auto-approve changes</span>
            </label>

            <div className="settings-field">
              <span>Server status</span>
              <div className="settings-note">
                {settings.running && settings.enabled
                  ? `Running on localhost:${settings.port}`
                  : "Stopped"}
              </div>
            </div>

            <div className="settings-field">
              <span>Token</span>
              {generatedToken ? (
                <div className="token-box">{generatedToken}</div>
              ) : settings.hasToken ? (
                <div className="token-box token-box-muted">
                  {settings.tokenPreview ?? "Token is set"}
                </div>
              ) : (
                <div className="token-box token-box-muted">Token not generated</div>
              )}

              <div className="settings-actions-row">
                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  disabled={saving}
                >
                  {settings.hasToken ? "Regenerate token" : "Generate token"}
                </button>
                <button
                  type="button"
                  onClick={handleCopyToken}
                  disabled={!generatedToken}
                >
                  Copy new token
                </button>
              </div>
              <div className="settings-hint">
                Full token is shown only right after generation/regeneration.
              </div>
            </div>

            {copyNotice && <div className="settings-note">{copyNotice}</div>}
          </>
        )}

        {error && <div className="settings-error">{error}</div>}

        <div className="settings-footer">
          <button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { api } from "../api/client";
import { ENDPOINTS } from "../api/endpoints";
import { useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { Button } from "../ui/Form";
import { useToast } from "../ui/ToastProvider";

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pill ${active ? "pillActive" : ""}`}
    >
      {active ? <span className="pillCheck">✓</span> : null}
      {children}
    </button>
  );
}

export default function Onboarding() {
  const nav = useNavigate();
  const { push } = useToast();

  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [cryptoAssets, setCryptoAssets] = useState([]);
  const [investorType, setInvestorType] = useState("");
  const [contentType, setContentType] = useState([]);

  const ASSETS = ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE"];
  const TYPES = ["long_term", "short_term", "day_trader"];
  const CONTENT = ["news", "prices", "ai_insight", "meme"];

  function toggle(arr, v) {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  const isValid = useMemo(() => {
    return cryptoAssets.length > 0 && investorType && contentType.length > 0;
  }, [cryptoAssets, investorType, contentType]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (saving) return;

    if (!isValid) {
      setErr("Select at least 1 asset, 1 investor type, and 1 content type.");
      return;
    }

    try {
      setSaving(true);
      await api.post(ENDPOINTS.onboarding, {
        crypto_assets: cryptoAssets,
        investor_type: investorType,
        content_type: contentType,
      });

      push("Saved! Your choices will personalize the dashboard.", "success", 3000);
      setTimeout(() => nav("/dashboard"), 700);
    } catch (e2) {
      const msg = e2?.response?.data?.detail || "Failed to save onboarding";
      setErr(msg);
      push(msg, "error", 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell title="Personalize your feed" subtitle="Choose assets, style, and the content you want.">
      <form onSubmit={onSubmit} className="grid" style={{ gap: 18 }}>
        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Crypto assets</div>
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
              {ASSETS.map((a) => (
                <Pill
                  key={a}
                  active={cryptoAssets.includes(a)}
                  onClick={() => setCryptoAssets((p) => toggle(p, a))}
                >
                  {a}
                </Pill>
              ))}
            </div>
            <div className="hint">Pick at least 1.</div>
          </div>
        </div>

        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Investor type</div>
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
              {TYPES.map((t) => (
                <Pill key={t} active={investorType === t} onClick={() => setInvestorType(t)}>
                  {t}
                </Pill>
              ))}
            </div>
            <div className="hint">Pick exactly 1.</div>
          </div>
        </div>

        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Content</div>
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
              {CONTENT.map((c) => (
                <Pill
                  key={c}
                  active={contentType.includes(c)}
                  onClick={() => setContentType((p) => toggle(p, c))}
                >
                  {c}
                </Pill>
              ))}
            </div>
            <div className="hint">Pick at least 1.</div>
          </div>
        </div>

        {err ? <div className="error">{err}</div> : null}

        <div className="formActions">
          <div className="formActionsRight">
            <Button variant="primary" type="submit" disabled={!isValid || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </Shell>
  );
}

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
  
  const [otherAsset, setOtherAsset] = useState("");
  const [useOther, setUseOther] = useState(false);


  const ASSETS = ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "BNB", "USDT", "AVAX"];
  const TYPES = ["long_term", "short_term", "day_trader"];
  const CONTENT = ["news", "prices", "ai_insight", "meme"];

  function toggle(arr, v) {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  const isValid = useMemo(() => {
    const hasAsset = cryptoAssets.length > 0 || (useOther && otherAsset.trim());
    return hasAsset && investorType && contentType.length > 0;
  }, [cryptoAssets, investorType, contentType, useOther, otherAsset]);  

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
      const finalAssets = [...cryptoAssets];
      if (useOther && otherAsset.trim()) {
        finalAssets.push(otherAsset.trim());
      }

      const res = await api.post(ENDPOINTS.onboarding, {
        crypto_assets: finalAssets,
        investor_type: investorType,
        content_type: contentType,
      });
      
      const warnings = res?.data?.warnings || [];
      const saved = !!res?.data?.saved;
      
      warnings.forEach((w) => push(w, "info", 3500));
      
      if (!saved) {
        const msg = res?.data?.message || "Please choose at least one valid coin.";
        setErr(msg);
        push(msg, "error", 3500);
        return; // stay on onboarding
      }
      
      push("Saved! Your choices will personalize the dashboard.", "success", 2500);
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

              {/* Other becomes a “pill” with an input inside */}
              <button
                type="button"
                className={`pill ${useOther ? "pillActive" : ""}`}
                onClick={() => {
                  setUseOther((p) => {
                    const next = !p;
                    if (!next) setOtherAsset(""); 
                    return next;
                  });
                }}
                
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {useOther ? <span className="pillCheck">✓</span> : null}
                <span>Other:</span>
                <input
                  value={otherAsset}
                  onChange={(e) => {
                    setOtherAsset(e.target.value);
                    if (!useOther) setUseOther(true);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="e.g. Toncoin / TON"
                  className="input"
                  style={{
                    width: 150,
                    padding: "6px 10px",
                    borderRadius: 999,
                  }}
                />
              </button>
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

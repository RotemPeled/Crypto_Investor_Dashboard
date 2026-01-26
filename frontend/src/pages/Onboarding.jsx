import React, { useState } from "react";
import { api } from "../api/client";
import { ENDPOINTS } from "../api/endpoints";
import { useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { Button } from "../ui/Form";

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn"
      style={{
        borderRadius: 999,
        background: active ? "rgba(255,255,255,0.22)" : undefined,
        borderColor: active ? "rgba(255,255,255,0.35)" : undefined,
        boxShadow: active ? "0 8px 20px rgba(0,0,0,0.35)" : undefined,
        opacity: 1
      }}
    >
      {children}
    </button>
  );
}

export default function Onboarding() {
  const nav = useNavigate();
  const [err, setErr] = useState("");

  const [cryptoAssets, setCryptoAssets] = useState(["BTC", "ETH"]);
  const [investorType, setInvestorType] = useState("long_term");
  const [contentType, setContentType] = useState(["news", "prices", "ai_insight", "meme"]);

  const ASSETS = ["BTC","ETH","SOL","XRP","ADA","DOGE"];
  const TYPES = ["long_term","short_term","day_trader"];
  const CONTENT = ["news","prices","ai_insight","meme"];

  function toggle(arr, v) {
    return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await api.post(ENDPOINTS.onboarding, {
        crypto_assets: cryptoAssets,
        investor_type: investorType,
        content_type: contentType,
      });
      nav("/dashboard");
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to save onboarding");
    }
  }

  return (
    <Shell
      title="Personalize your feed"
      subtitle="Choose assets, style, and the content you want. You can refine later."
      right={<span className="badge">Preferences</span>}
    >
      <form onSubmit={onSubmit} className="grid" style={{ gap: 18 }}>
        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Crypto assets</div>
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
              {ASSETS.map(a => (
                <Pill key={a} active={cryptoAssets.includes(a)} onClick={() => setCryptoAssets(p => toggle(p, a))}>
                  {a}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Investor type</div>
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
              {TYPES.map(t => (
                <Pill key={t} active={investorType === t} onClick={() => setInvestorType(t)}>
                  {t}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Content</div>
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
              {CONTENT.map(c => (
                <Pill key={c} active={contentType.includes(c)} onClick={() => setContentType(p => toggle(p, c))}>
                  {c}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        {err ? <div className="error">{err}</div> : null}

        <div className="row">
          <span className="badge">This will unlock your dashboard</span>
          <Button variant="primary" type="submit">Save</Button>
        </div>
      </form>
    </Shell>
  );
}

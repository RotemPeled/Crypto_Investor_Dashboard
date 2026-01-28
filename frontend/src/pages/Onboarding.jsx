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

  // Other asset (attempt to resolve to CoinGecko ID)
  const [useOther, setUseOther] = useState(false);
  const [otherQuery, setOtherQuery] = useState("");
  const [otherResolved, setOtherResolved] = useState(null); // { id, name, symbol }
  const [resolvingOther, setResolvingOther] = useState(false);

  const ASSETS = [
    { id: "bitcoin", label: "Bitcoin" },
    { id: "ethereum", label: "Ethereum" },
    { id: "solana", label: "Solana" },
    { id: "ripple", label: "Ripple (XRP)" },
    { id: "cardano", label: "Cardano" },
    { id: "dogecoin", label: "Dogecoin" },
    { id: "binancecoin", label: "BNB" },
    { id: "tether", label: "Tether (USDT)" },
    { id: "avalanche-2", label: "Avalanche (AVAX)" },
    { id: "chainlink", label: "Chainlink (LINK)" },
    { id: "polkadot", label: "Polkadot (DOT)" },
    { id: "the-open-network", label: "Toncoin (TON)" },
  ];

  const TYPES = [
    { value: "long_term", label: "HODLer" },
    { value: "short_term", label: "Day Trader" },
    { value: "nft_collector", label: "NFT Collector" },
    { value: "swing_trader", label: "Swing Trader" },
    { value: "defi_yield", label: "DeFi Yield Farmer" },
  ];

  const CONTENT_TYPES = [
    { value: "market_news", label: "Market News & Price Moves" },
    { value: "charts", label: "Charts & Technical Analysis" },
    { value: "fun", label: "Fun (Memes & Humor)" },
    { value: "development", label: "Project Updates & Development" },
    { value: "regulation", label: "Regulation & Macro" },
    { value: "security", label: "Security & Risks" },
    { value: "social", label: "Social Buzz & Sentiment" },
  ];

  function toggle(arr, v) {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  async function resolveOtherToCoinGecko(queryRaw) {
    const q = (queryRaw || "").trim();
    if (!q) {
      setOtherResolved(null);
      return;
    }

    setResolvingOther(true);
    try {
      const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("CoinGecko search failed");
      const data = await r.json();

      const best = data?.coins?.[0];
      if (best?.id) {
        setOtherResolved({ id: best.id, name: best.name, symbol: best.symbol });
      } else {
        setOtherResolved(null);
        push(`Couldn't match "${q}" to CoinGecko. It may not show prices/news.`, "info", 3200);
      }
    } catch {
      setOtherResolved(null);
      push("Couldn't verify the 'Other' asset right now. You can still save it.", "info", 3200);
    } finally {
      setResolvingOther(false);
    }
  }

  const isValid = useMemo(() => {
    const otherOk = useOther && otherQuery.trim().length > 0;
    const hasAsset = cryptoAssets.length > 0 || otherOk;
    return hasAsset && investorType && contentType.length > 0;
  }, [cryptoAssets, investorType, contentType, useOther, otherQuery]);

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

      if (useOther && otherQuery.trim()) {
        // Prefer CoinGecko ID if matched; otherwise save raw text
        finalAssets.push(otherResolved?.id || otherQuery.trim());
        if (!otherResolved?.id) {
          push("Note: 'Other' asset wasn't matched to CoinGecko ID, so it may not fully work in Prices/News.", "info", 3500);
        }
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
        const msg = res?.data?.message || "Please choose at least one valid asset.";
        setErr(msg);
        push(msg, "error", 3500);
        return;
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
                  key={a.id}
                  active={cryptoAssets.includes(a.id)}
                  onClick={() => setCryptoAssets((p) => toggle(p, a.id))}
                >
                  {a.label}
                </Pill>
              ))}

              {/* Other pill with CoinGecko resolution */}
              <button
                type="button"
                className={`pill ${useOther ? "pillActive" : ""}`}
                onClick={() => {
                  setUseOther((p) => {
                    const next = !p;
                    if (!next) {
                      setOtherQuery("");
                      setOtherResolved(null);
                    }
                    return next;
                  });
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {useOther ? <span className="pillCheck">✓</span> : null}
                <span>Other:</span>

                <input
                  value={otherQuery}
                  onChange={(e) => {
                    setOtherQuery(e.target.value);
                    if (!useOther) setUseOther(true);
                    setOtherResolved(null);
                  }}
                  onBlur={() => resolveOtherToCoinGecko(otherQuery)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      resolveOtherToCoinGecko(otherQuery);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="e.g. Toncoin / TON"
                  className="input"
                  style={{
                    width: 160,
                    padding: "6px 10px",
                    borderRadius: 999,
                  }}
                />

                {useOther ? (
                  <span style={{ fontSize: 12, opacity: 0.85 }}>
                    
                  </span>
                ) : null}
              </button>
            </div>

            <div className="hint">Pick at least 1</div>
          </div>
        </div>

        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Investor type</div>
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
              {TYPES.map((t) => (
                <Pill
                  key={t.value}
                  active={investorType === t.value}
                  onClick={() => setInvestorType(t.value)}
                >
                  {t.label}
                </Pill>
              ))}
            </div>
            <div className="hint">Pick exactly 1</div>
          </div>
        </div>

        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Content</div>
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
              {CONTENT_TYPES.map((c) => (
                <Pill
                  key={c.value}
                  active={contentType.includes(c.value)}
                  onClick={() => setContentType((p) => toggle(p, c.value))}
                >
                  {c.label}
                </Pill>
              ))}
            </div>
            <div className="hint">Pick at least 1</div>
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

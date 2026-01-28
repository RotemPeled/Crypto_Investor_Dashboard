import React, { useMemo, useState } from "react";
import { api } from "../api/client";
import { ENDPOINTS } from "../api/endpoints";
import { useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { Button } from "../ui/Form";
import { useToast } from "../ui/ToastProvider";

/**
 * Static option lists are defined outside the component to keep renders clean
 * and to improve readability/maintainability.
 */
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

function toggleArrayValue(arr, v) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export default function Onboarding() {
  const nav = useNavigate();
  const { push } = useToast();

  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [cryptoAssets, setCryptoAssets] = useState([]);
  const [investorType, setInvestorType] = useState("");
  const [contentType, setContentType] = useState([]);

  // "Other" asset (optional). We attempt to resolve it to a CoinGecko coin id for better backend compatibility.
  const [useOther, setUseOther] = useState(false);
  const [otherQuery, setOtherQuery] = useState("");
  const [otherResolved, setOtherResolved] = useState(null); // { id, name, symbol }
  const [resolvingOther, setResolvingOther] = useState(false);

  const otherValue = useMemo(() => otherQuery.trim(), [otherQuery]);

  /**
   * Validation: at least 1 asset (selected list OR "Other" with a non-empty value),
   * exactly 1 investor type, and at least 1 content type.
   */
  const isValid = useMemo(() => {
    const hasAsset = cryptoAssets.length > 0 || (useOther && otherValue.length > 0);
    const hasInvestor = Boolean(investorType);
    const hasContent = contentType.length > 0;
    return hasAsset && hasInvestor && hasContent;
  }, [cryptoAssets, investorType, contentType, useOther, otherValue]);

  /**
   * Resolves a free-text query to a CoinGecko coin id.
   * This improves the probability that backend price/news will work for the "Other" asset.
   */
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
      }
    } catch {
      // Keep UX forgiving: user can still save and let the server try to resolve it.
      setOtherResolved(null);
    } finally {
      setResolvingOther(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (saving) return;
  
    // If "Other" is enabled, ensure we have a resolved id before submitting.
    if (useOther && otherValue && !otherResolved && !resolvingOther) {
      await resolveOtherToCoinGecko(otherValue);
    }
  
    // If still resolving or still not resolved, prevent submit (or let the server try).
    if (useOther && resolvingOther) return;
  
    if (!isValid) {
      setErr("Select at least 1 asset, 1 investor type, and 1 content type.");
      return;
    }
  
    try {
      setSaving(true);
  
      const finalAssets = [...cryptoAssets];
      if (useOther && otherValue) {
        finalAssets.push(otherResolved?.id || otherValue); // prefer resolved id
      }
  
      const res = await api.post(ENDPOINTS.onboarding, {
        crypto_assets: finalAssets,
        investor_type: investorType,
        content_type: contentType,
      });

      const warnings = res?.data?.warnings || [];
      const saved = Boolean(res?.data?.saved);

      // Show any server-side resolution messages (most reliable source of truth).
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

  const otherStatusText = useMemo(() => {
    if (!useOther) return "";
    if (!otherValue) return "";
    if (resolvingOther) return "Checking CoinGecko…";
    if (otherResolved?.id) return `Matched: ${otherResolved.name} (${String(otherResolved.symbol || "").toUpperCase()})`;
    return "Not matched.";
  }, [useOther, otherValue, resolvingOther, otherResolved]);

  return (
    <Shell title="Personalize your feed" subtitle="Choose assets, style, and the content you want.">
      <form onSubmit={onSubmit} className="grid" style={{ gap: 18 }}>
        {/* Assets */}
        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Crypto assets</div>

            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start", gap: 10 }}>
              {ASSETS.map((a) => (
                <Pill
                  key={a.id}
                  active={cryptoAssets.includes(a.id)}
                  onClick={() => setCryptoAssets((p) => toggleArrayValue(p, a.id))}
                >
                  {a.label}
                </Pill>
              ))}

              {/* "Other" is separated from input to avoid nested interactive elements */}
              <Pill
                active={useOther}
                onClick={() => {
                  setUseOther((prev) => {
                    const next = !prev;
                    if (!next) {
                      setOtherQuery("");
                      setOtherResolved(null);
                    }
                    return next;
                  });
                }}
              >
                Other
              </Pill>
            </div>

            {useOther ? (
              <div className="row" style={{ marginTop: 10, alignItems: "center", gap: 10 }}>
                <input
                  value={otherQuery}
                  onChange={(e) => {
                    setOtherQuery(e.target.value);
                    setOtherResolved(null);
                  }}
                  onBlur={() => resolveOtherToCoinGecko(otherQuery)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      resolveOtherToCoinGecko(otherQuery);
                    }
                  }}
                  placeholder="e.g. Toncoin / TON"
                  className="input"
                  style={{ width: 260, padding: "8px 12px", borderRadius: 999 }}
                />
                <span style={{ fontSize: 12, opacity: 0.85 }}>{otherStatusText}</span>
              </div>
            ) : null}

            <div className="hint">Pick at least 1</div>
          </div>
        </div>

        {/* Investor type */}
        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Investor type</div>
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start", gap: 10 }}>
              {TYPES.map((t) => (
                <Pill key={t.value} active={investorType === t.value} onClick={() => setInvestorType(t.value)}>
                  {t.label}
                </Pill>
              ))}
            </div>
            <div className="hint">Pick exactly 1</div>
          </div>
        </div>

        {/* Content */}
        <div className="card" style={{ background: "transparent" }}>
          <div className="cardInner">
            <div className="label">Content</div>
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start", gap: 10 }}>
              {CONTENT_TYPES.map((c) => (
                <Pill
                  key={c.value}
                  active={contentType.includes(c.value)}
                  onClick={() => setContentType((p) => toggleArrayValue(p, c.value))}
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
          <Button variant="primary" type="submit" disabled={!isValid || saving || resolvingOther}>
            {saving ? "Saving…" : "Save"}
          </Button>

          </div>
        </div>
      </form>
    </Shell>
  );
}

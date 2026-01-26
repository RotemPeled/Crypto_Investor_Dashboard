import React, { useState } from "react";
import { api } from "../api/client";
import { ENDPOINTS } from "../api/endpoints";
import { useNavigate } from "react-router-dom";

export default function Onboarding() {
  const nav = useNavigate();
  const [err, setErr] = useState("");

  // תואם בדיוק ל-OnboardingReq שלך:
  // crypto_assets: list[str], investor_type: str, content_type: list[str]
  const [cryptoAssets, setCryptoAssets] = useState(["BTC", "ETH"]);
  const [investorType, setInvestorType] = useState("long_term");
  const [contentType, setContentType] = useState(["news", "prices", "ai_insight", "meme"]);

  function toggleFromArray(arr, value) {
    return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
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
    <div style={{ padding: 24 }}>
      <h2>Onboarding</h2>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 16, maxWidth: 520 }}>
        <div>
          <div><b>Crypto assets</b></div>
          {["BTC","ETH","SOL","XRP","ADA","DOGE"].map((a) => (
            <label key={a} style={{ marginRight: 12 }}>
              <input
                type="checkbox"
                checked={cryptoAssets.includes(a)}
                onChange={() => setCryptoAssets((prev) => toggleFromArray(prev, a))}
              />
              {a}
            </label>
          ))}
        </div>

        <div>
          <div><b>Investor type</b></div>
          <select value={investorType} onChange={(e) => setInvestorType(e.target.value)}>
            <option value="long_term">long_term</option>
            <option value="short_term">short_term</option>
            <option value="day_trader">day_trader</option>
          </select>
        </div>

        <div>
          <div><b>Content type</b></div>
          {["news", "prices", "ai_insight", "meme"].map((c) => (
            <label key={c} style={{ marginRight: 12 }}>
              <input
                type="checkbox"
                checked={contentType.includes(c)}
                onChange={() => setContentType((prev) => toggleFromArray(prev, c))}
              />
              {c}
            </label>
          ))}
        </div>

        <button type="submit">Save</button>
      </form>

      {err && <p style={{ color: "red" }}>{err}</p>}
    </div>
  );
}

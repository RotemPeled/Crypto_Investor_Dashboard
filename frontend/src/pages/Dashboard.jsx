import React, { useEffect, useState } from "react";
import { getDashboard } from "../api/dashboard";
import { saveVote } from "../api/votes";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const nav = useNavigate();
  const { logout } = useAuth();

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const d = await getDashboard();
      setData(d);
    } catch (e2) {
      if (e2?.response?.status === 401) {
        logout();
        nav("/login");
        return;
      }
      setErr(e2?.response?.data?.detail || "Failed to load dashboard");
    }
  }

  useEffect(() => { load(); }, []);

  async function vote(section, item, value) {
    try {
      await saveVote({ section, item, value }); // item חייב להיות string אצלך
      alert("vote saved");
    } catch {
      alert("vote failed");
    }
  }

  if (err) return <div style={{ padding: 24, color: "red" }}>{err}</div>;
  if (!data) return <div style={{ padding: 24 }}>Loading...</div>;

  const sections = data.sections || {};
  const prices = sections.prices;
  const news = sections.news;
  const ai = sections.ai_insight;
  const meme = sections.meme;

  return (
    <div style={{ padding: 24, display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Dashboard</h2>
        <button onClick={() => { logout(); nav("/login"); }}>Logout</button>
      </div>

      <section style={{ border: "1px solid #ddd", padding: 12 }}>
        <h3>Prices (CoinGecko)</h3>
        {prices?.error && <p style={{ color: "red" }}>{prices.error}</p>}
        <pre>{JSON.stringify(prices?.data, null, 2)}</pre>
        <button onClick={() => vote("prices", "prices_block", 1)}>👍</button>
        <button onClick={() => vote("prices", "prices_block", -1)}>👎</button>
      </section>

      <section style={{ border: "1px solid #ddd", padding: 12 }}>
        <h3>News (CryptoPanic)</h3>
        {news?.error && <p style={{ color: "red" }}>{news.error}</p>}
        {(news?.data || []).map((n, idx) => (
          <div key={idx} style={{ marginBottom: 10 }}>
            <div><b>{n.title}</b></div>
            <div>{n.published_at || ""}</div>
            {/* item אצלך הוא string → נשתמש בכותרת (או idx) */}
            <button onClick={() => vote("news", n.title || String(idx), 1)}>👍</button>
            <button onClick={() => vote("news", n.title || String(idx), -1)}>👎</button>
          </div>
        ))}
      </section>

      <section style={{ border: "1px solid #ddd", padding: 12 }}>
        <h3>AI Insight</h3>
        {ai?.error && <p style={{ color: "red" }}>{ai.error}</p>}
        <p>{ai?.data}</p>
        <button onClick={() => vote("ai_insight", "today_insight", 1)}>👍</button>
        <button onClick={() => vote("ai_insight", "today_insight", -1)}>👎</button>
      </section>

      <section style={{ border: "1px solid #ddd", padding: 12 }}>
        <h3>Meme</h3>
        <div><b>{meme?.title}</b></div>
        {meme?.url && <img src={meme.url} alt="meme" style={{ maxWidth: 320 }} />}
        <div style={{ marginTop: 8 }}>
          <button onClick={() => vote("meme", meme?.url || "meme", 1)}>👍</button>
          <button onClick={() => vote("meme", meme?.url || "meme", -1)}>👎</button>
        </div>
      </section>

      <button onClick={load}>Reload</button>
    </div>
  );
}

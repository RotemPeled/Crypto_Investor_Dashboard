// Dashboard.jsx (NEW FILE)
import React, { useEffect, useState } from "react";
import { getDashboard } from "../api/dashboard";
import { saveVote } from "../api/votes";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { Button } from "../ui/Form";
import { ThumbsUp, ThumbsDown } from "lucide-react";


function Section({ title, subtitle, right, children }) {
  return (
    <div className="card" style={{ background: "transparent" }}>
      <div className="cardInner">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 16, letterSpacing: "-0.01em" }}>
              <b>{title}</b>
            </div>
            {subtitle ? (
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          {right ? <div>{right}</div> : null}
        </div>
        <hr className="hr" />
        {children}
      </div>
    </div>
  );
}


/* --- VoteBar: compact + can be aligned by wrapper --- */
function VoteBar({ onUp, onDown, className = "" }) {
    return (
      <div className={`voteBar ${className}`}>
        <button className="voteBtn" onClick={onUp} aria-label="Like">
          <ThumbsUp size={16} strokeWidth={1.6} />
        </button>
        <button className="voteBtn" onClick={onDown} aria-label="Dislike">
          <ThumbsDown size={16} strokeWidth={1.6} />
        </button>
      </div>
    );
  }
  

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

  async function vote(section, item, value) {
    try {
      await saveVote({ section, item, value });
    } catch {}
  }

  useEffect(() => {
    load();
  }, []);

  if (err) {
    return (
      <Shell
        title="Dashboard"
        subtitle="Something went wrong."
        right={
          <Button
            variant="danger"
            onClick={() => {
              logout();
              nav("/login");
            }}
          >
            Logout
          </Button>
        }
      >
        <div className="error">{err}</div>
        <div style={{ marginTop: 12 }}>
          <Button onClick={load}>Retry</Button>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell title="Dashboard" subtitle="Loading your sections…" right={<span className="badge">Today</span>}>
        <div className="badge">Fetching data…</div>
      </Shell>
    );
  }

  const s = data.sections || {};
  const prices = s.prices;
  const news = s.news;
  const ai = s.ai_insight;
  const meme = s.meme;

  return (
    <Shell
      title="Today Dashboard"
      right={
        <div className="row">
          <Button
            variant="danger"
            onClick={() => {
              logout();
              nav("/login");
            }}
          >
            Logout
          </Button>
        </div>
      }
    >
      <div className="grid" style={{ gap: 14 }}>
        <div className="grid2">
          <Section
            title="Prices"
            subtitle={prices?.error ? `Error: ${prices.error}` : "CoinGecko snapshot (USD)"}
            right={<span className="badge">{prices?.source || "coingecko"}</span>}
          >
            <pre style={{ margin: 0, color: "var(--muted)", overflowX: "auto" }}>
              {JSON.stringify(prices?.data, null, 2)}
            </pre>

            {/* compact meta-action, aligned right */}
            <div className="metaFooter">
              <VoteBar
                className="voteBarRight"
                onUp={() => vote("prices", "prices_block", 1)}
                onDown={() => vote("prices", "prices_block", -1)}
              />
            </div>
          </Section>

          <Section
            title="AI Insight"
            subtitle={ai?.error ? `Error: ${ai.error}` : "Short, investor-type oriented"}
            right={<span className="badge">{ai?.source || "openrouter"}</span>}
          >
            <div className="insightBody">
              <div className="insightText">{ai?.data}</div>

              {/* right-aligned, subtle */}
              <div className="metaFooter">
                <VoteBar
                  className="voteBarRight"
                  onUp={() => vote("ai_insight", "today_insight", 1)}
                  onDown={() => vote("ai_insight", "today_insight", -1)}
                />
              </div>
            </div>
          </Section>
        </div>

        <Section
          title="News"
          subtitle={news?.error ? `Error: ${news.error}` : "Latest headlines"}
          right={<span className="badge">{news?.source || "cryptopanic"}</span>}
        >
          <div className="grid" style={{ gap: 12 }}>
            {(news?.data || []).map((n, idx) => (
              <div key={idx} className="tile" style={{ padding: 12 }}>
                <div style={{ fontSize: 14 }}>
                  <b>{n.title}</b>
                </div>
                <div style={{ color: "var(--muted2)", fontSize: 12, marginTop: 6 }}>
                  {n.published_at || "—"}
                </div>

                <div className="metaFooter">
                  <VoteBar
                    className="voteBarRight"
                    onUp={() => vote("news", n.title || String(idx), 1)}
                    onDown={() => vote("news", n.title || String(idx), -1)}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Meme" subtitle="Because the market demands balance." right={<span className="badge">fun</span>}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14 }}>
                <b>{meme?.title}</b>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>Lightweight morale booster.</div>

              <div className="metaFooter">
                <VoteBar
                  className="voteBarRight"
                  onUp={() => vote("meme", meme?.url || "meme", 1)}
                  onDown={() => vote("meme", meme?.url || "meme", -1)}
                />
              </div>
            </div>

            {meme?.url ? (
              <img
                src={meme.url}
                alt="meme"
                style={{
                  width: 240,
                  maxWidth: "40vw",
                  borderRadius: 18,
                  border: "1px solid var(--stroke)",
                  boxShadow: "var(--shadow2)",
                }}
              />
            ) : null}
          </div>
        </Section>
      </div>
    </Shell>
  );
}

import React, { useEffect, useState } from "react";
import { getDashboard } from "../api/dashboard";
import { saveVote } from "../api/votes";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { Button } from "../ui/Form";
import Section from "../ui/Section";
import VoteBar from "../ui/VoteBar";

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
      <div className="dashboardGrid2x2">
        {/* 1) Prices (vote next to title) */}
        <Section
          title="Coin Prices"
          headerRight={
            <VoteBar
              onUp={() => vote("prices", "prices_block", 1)}
              onDown={() => vote("prices", "prices_block", -1)}
            />
          }
        >
          <pre className="preSoft">{JSON.stringify(prices?.data, null, 2)}</pre>
        </Section>

        {/* 2) AI Insight (vote next to title) */}
        <Section
          title="AI Insight of the Day"
          headerRight={
            <VoteBar
              onUp={() => vote("ai_insight", "today_insight", 1)}
              onDown={() => vote("ai_insight", "today_insight", -1)}
            />
          }
        >
          <div className="insightBody">
            <div className="insightText">{ai?.data}</div>
          </div>
        </Section>

        {/* 3) News (each article has its own vote) */}
        <Section title="Market News">
          <div className="newsList">
            {(news?.data || []).slice(0, 6).map((n, idx) => (
              <div key={idx} className="tile">
                <div className="tileTitle">{n.title}</div>
                <div className="tileMeta">{n.published_at || "—"}</div>

                <div className="metaFooter">
                  <VoteBar
                    onUp={() => vote("news", n.title || String(idx), 1)}
                    onDown={() => vote("news", n.title || String(idx), -1)}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 4) Meme (vote next to title + image fills the card) */}
        <Section
          title="Meme"
          headerRight={
            <VoteBar
              onUp={() => vote("meme", meme?.url || "meme", 1)}
              onDown={() => vote("meme", meme?.url || "meme", -1)}
            />
          }
        >
          {meme?.url ? (
            <div className="memeWrap">
              <img src={meme.url} alt="meme" className="memeImgFull" />
              <div className="memeCaption">{meme?.title || "Daily crypto meme"}</div>
            </div>
          ) : (
            <div className="badge">No meme</div>
          )}
        </Section>
      </div>
    </Shell>
  );
}

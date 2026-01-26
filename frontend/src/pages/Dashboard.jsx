import React, { useEffect, useState } from "react";
import { getDashboard } from "../api/dashboard";
import { saveVote } from "../api/votes";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { Button } from "../ui/Form";
import Section from "../ui/Section";
import VoteBar from "../ui/VoteBar";
import { useToast } from "../ui/ToastProvider";

export default function Dashboard() {
  const nav = useNavigate();
  const { logout } = useAuth();
  const { push } = useToast();

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  // persistent selection (in-session)
  const [votes, setVotes] = useState({});       // key -> 1 / -1
  const [voteBusy, setVoteBusy] = useState({}); // key -> true

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
    const key = `${section}::${item}`;
    const current = votes[key] || 0;

    // same vote again => do nothing
    if (current === value) {
      return;
    }

    if (voteBusy[key]) return;

    // optimistic UI: keep selected
    setVotes((p) => ({ ...p, [key]: value }));
    setVoteBusy((p) => ({ ...p, [key]: true }));

    try {
      await saveVote({ section, item, value });
    } catch {
      // rollback
      setVotes((p) => ({ ...p, [key]: current }));
    } finally {
      setVoteBusy((p) => {
        const copy = { ...p };
        delete copy[key];
        return copy;
      });
    }
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
      title="Today's Dashboard"
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
        <Section
          title="Coin Prices"
          headerRight={
            <VoteBar
              selected={votes["prices::prices_block"] || 0}
              disabled={!!voteBusy["prices::prices_block"]}
              onUp={() => vote("prices", "prices_block", 1)}
              onDown={() => vote("prices", "prices_block", -1)}
            />
          }
        >
          <pre className="preSoft">{JSON.stringify(prices?.data, null, 2)}</pre>
        </Section>

        <Section
          title="AI Insight of the Day"
          headerRight={
            <VoteBar
              selected={votes["ai_insight::today_insight"] || 0}
              disabled={!!voteBusy["ai_insight::today_insight"]}
              onUp={() => vote("ai_insight", "today_insight", 1)}
              onDown={() => vote("ai_insight", "today_insight", -1)}
            />
          }
        >
          <div className="insightBody">
            <div className="insightText">{ai?.data}</div>
          </div>
        </Section>

        <Section title="Market News">
          <div className="newsList">
            {(news?.data || []).slice(0, 6).map((n, idx) => {
              const itemKey = n.title || String(idx);
              const k = `news::${itemKey}`;
              return (
                <div key={idx} className="tile">
                  <div className="tileTitle">{n.title}</div>
                  <div className="tileMeta">{n.published_at || "—"}</div>

                  <div className="metaFooter">
                    <VoteBar
                      selected={votes[k] || 0}
                      disabled={!!voteBusy[k]}
                      onUp={() => vote("news", itemKey, 1)}
                      onDown={() => vote("news", itemKey, -1)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="Meme"
          headerRight={
            <VoteBar
              selected={votes[`meme::${meme?.url || "meme"}`] || 0}
              disabled={!!voteBusy[`meme::${meme?.url || "meme"}`]}
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

import React, { useEffect, useState } from "react";
import { getDashboard, refreshSection } from "../api/dashboard";
import { saveVote, getVotesToday } from "../api/votes";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { Button } from "../ui/Form";
import Section from "../ui/Section";
import { VoteBar, RefreshIconButton } from "../ui/IconActions";
import { useToast } from "../ui/ToastProvider";

export default function Dashboard() {
  const nav = useNavigate();
  const { logout } = useAuth();
  const { push } = useToast();

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [refreshBusy, setRefreshBusy] = useState({}); // section -> true

  // persistent selection (in-session)
  const [votes, setVotes] = useState({}); // key -> 1 / -1
  const [voteBusy, setVoteBusy] = useState({}); // key -> true

  async function load() {
    setErr("");
    try {
      const d = await getDashboard();
      setData(d);

      const todayVotes = await getVotesToday();
      const map = {};
      for (const v of todayVotes) {
        map[`${v.section}::${v.item}`] = v.value;
      }
      setVotes(map);
    } catch (e2) {
      if (e2?.response?.status === 401) {
        logout();
        nav("/login");
        return;
      }
      setErr(e2?.response?.data?.detail || "Failed to load dashboard");
    }
  }

  async function refresh(section) {
    if (refreshBusy[section]) return;

    setRefreshBusy((p) => ({ ...p, [section]: true }));
    try {
      const d = await refreshSection(section);
      setData(d);

      // reload today's votes (content may change)
      const todayVotes = await getVotesToday();
      const map = {};
      for (const v of todayVotes) {
        map[`${v.section}::${v.item}`] = v.value;
      }
      setVotes(map);

    } catch (e) {
      if (e?.response?.status === 401) {
        logout();
        nav("/login");
        return;
      }
    } finally {
      setRefreshBusy((p) => {
        const copy = { ...p };
        delete copy[section];
        return copy;
      });
    }
  }

  async function vote(section, item, value) {
    const key = `${section}::${item}`;
    const current = votes[key] || 0;

    if (current === value) return;
    if (voteBusy[key]) return;

    setVotes((p) => ({ ...p, [key]: value }));
    setVoteBusy((p) => ({ ...p, [key]: true }));

    try {
      await saveVote({ section, item, value });
    } catch {
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
  const pricesMetaById = (prices?.meta || []).reduce((acc, m) => {
    acc[m.id] = m;
    return acc;
  }, {});
  
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
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <RefreshIconButton
                onClick={() => refresh("prices")}
                loading={!!refreshBusy["prices"]}
                title="Refresh prices"
              />
              <VoteBar
                selected={votes["prices::prices_block"] || 0}
                disabled={!!voteBusy["prices::prices_block"]}
                onUp={() => vote("prices", "prices_block", 1)}
                onDown={() => vote("prices", "prices_block", -1)}
              />
            </div>
          }
        >
          <div className="pricesTable">
          {(prices?.data ? Object.entries(prices.data) : []).map(([coinId, v]) => {
            const name = pricesMetaById[coinId]?.name || coinId;
            const usd = Number(v?.usd ?? 0);
            const ch = v?.usd_24h_change;

            const hasChange = typeof ch === "number" && Number.isFinite(ch);
            const up = hasChange ? ch >= 0 : true;

            return (
              <div key={coinId} className="pricesRow">
                <div className="pricesCoin">
                  <div className="pricesName">{name}</div>
                </div>

                <div className="pricesRight">
                  <div className="pricesValue">${usd.toLocaleString()}</div>

                  {hasChange ? (
                    <div className={`pricesDelta ${up ? "up" : "down"}`} title="Change in the last 24 hours">
                      <span className="pricesArrow">{up ? "↑" : "↓"}</span>
                      <span>{Math.abs(ch).toFixed(2)}%</span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          </div>
        </Section>

        <Section
          title="AI Insight of the Day"
          headerRight={
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <RefreshIconButton
                onClick={() => refresh("ai_insight")}
                loading={!!refreshBusy["ai_insight"]}
                title="Refresh AI insight"
              />
              <VoteBar
                selected={votes["ai_insight::today_insight"] || 0}
                disabled={!!voteBusy["ai_insight::today_insight"]}
                onUp={() => vote("ai_insight", "today_insight", 1)}
                onDown={() => vote("ai_insight", "today_insight", -1)}
              />
            </div>
          }
        >
          <div className="insightBody">
            <div className="insightText">{ai?.data}</div>
          </div>
        </Section>

        <Section
          title="Market News"
          headerRight={
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <RefreshIconButton
                onClick={() => refresh("news")}
                loading={!!refreshBusy["news"]}
                title="Refresh news"
              />
            </div>
          }
        >
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
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <RefreshIconButton
                onClick={() => refresh("meme")}
                loading={!!refreshBusy["meme"]}
                title="Refresh meme"
              />
              <VoteBar
                selected={votes[`meme::${meme?.url || "meme"}`] || 0}
                disabled={!!voteBusy[`meme::${meme?.url || "meme"}`]}
                onUp={() => vote("meme", meme?.url || "meme", 1)}
                onDown={() => vote("meme", meme?.url || "meme", -1)}
              />
            </div>
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

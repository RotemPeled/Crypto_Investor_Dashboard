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

function MiniLineChart({ chart }) {
  // chart expected: { data: { coinId: [[ts, price], ...] }, range, source }
  const seriesEntries = Object.entries(chart?.data || {});
  if (!seriesEntries.length) return null;

  // Use the first coin as X baseline length
  const base = seriesEntries[0][1] || [];
  if (base.length < 2) return null;

  const W = 640;
  const H = 160;
  const PAD = 12;

  // Build a unified min/max across all series
  let minP = Infinity, maxP = -Infinity;
  for (const [, arr] of seriesEntries) {
    for (const p of arr || []) {
      const price = Number(p?.[1]);
      if (!Number.isFinite(price)) continue;
      if (price < minP) minP = price;
      if (price > maxP) maxP = price;
    }
  }
  if (!Number.isFinite(minP) || !Number.isFinite(maxP) || minP === maxP) {
    return null;
  }

  const toX = (i, n) => PAD + (i * (W - PAD * 2)) / (n - 1);
  const toY = (price) => {
    const t = (price - minP) / (maxP - minP);
    return H - PAD - t * (H - PAD * 2);
  };

  const buildPath = (arr) => {
    const n = arr.length;
    let d = "";
    for (let i = 0; i < n; i++) {
      const price = Number(arr[i]?.[1]);
      if (!Number.isFinite(price)) continue;
      const x = toX(i, n);
      const y = toY(price);
      d += (d ? " L " : "M ") + `${x} ${y}`;
    }
    return d;
  };

  return (
    <div className="chartBox">
      <div className="chartTop">
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="chartSvg" role="img" aria-label="Price chart">
        {/* grid line */}
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} className="chartGrid" />

        {seriesEntries.map(([coinId, arr], idx) => (
          <path key={coinId} d={buildPath(arr || [])} className={`chartLine line${idx % 5}`} />
        ))}
      </svg>
      
      <div className="chartLegend">
        {seriesEntries.map(([coinId], idx) => (
          <div key={coinId} className="legendItem">
            <span className={`legendSwatch line${idx % 5}`} />
            <span className="legendLabel">{coinId}</span>
          </div>
        ))}
      </div>

    </div>
  );
}

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
  const chart = s.chart;
  const fun = s.fun;


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
            {chart ? (
              <div className="tile">
                <div className="tileHeader">
                  <div className="tileTitle">Past 7 Days Prices</div>

                  <VoteBar
                    selected={votes["chart::price_chart"] || 0}
                    disabled={!!voteBusy["chart::price_chart"]}
                    onUp={() => vote("chart", "price_chart", 1)}
                    onDown={() => vote("chart", "price_chart", -1)}
                  />
                </div>
      
                <MiniLineChart chart={chart} />
              </div>
            ) : null}
            {fun ? (
              <div className="tile">
                <div className="tileHeader">
                  <div className="tileTitle">Fun Joke</div>

                  <VoteBar
                    selected={votes["fun::daily_fun"] || 0}
                    disabled={!!voteBusy["fun::daily_fun"]}
                    onUp={() => vote("fun", "daily_fun", 1)}
                    onDown={() => vote("fun", "daily_fun", -1)}
                  />
                </div>

                <div className="funText">{fun.text}</div>
              </div>
            ) : null}

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

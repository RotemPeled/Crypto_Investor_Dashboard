import { api } from "./client";
import { ENDPOINTS } from "./endpoints";

export async function saveVote({ dashboard_id, section, item, value }) {
  const res = await api.post(ENDPOINTS.votes, {
    dashboard_id,
    section,
    item,
    value,
  });
  return res.data; // { message: "vote saved" }
}

export async function getVotesToday({ dashboard_id } = {}) {
  const qs = new URLSearchParams({ date: "today" });
  if (dashboard_id != null) qs.set("dashboard_id", String(dashboard_id));

  const res = await api.get(`${ENDPOINTS.votes}?${qs.toString()}`);
  return res.data; // [{section,item,value}, ...]
}

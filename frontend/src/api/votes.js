import { api } from "./client";
import { ENDPOINTS } from "./endpoints";

export async function saveVote({ section, item, value }) {
  const res = await api.post(ENDPOINTS.votes, { section, item, value });
  return res.data; // { message: "vote saved" }
}

export async function getVotesToday() {
  const res = await api.get(`${ENDPOINTS.votes}?date=today`);
  return res.data; // [{section,item,value}, ...]
}

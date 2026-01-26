import { api } from "./client";
import { ENDPOINTS } from "./endpoints";

export async function getDashboard() {
  const res = await api.get(ENDPOINTS.dashboard);
  return res.data;
  // { preferences, sections: { prices, news, ai_insight, meme } }
}

import { api } from "./client";
import { ENDPOINTS } from "./endpoints";

export async function getDashboard() {
  const res = await api.get(ENDPOINTS.dashboard);
  return res.data;
}

export async function refreshSection(section) {
  const res = await api.post(ENDPOINTS.refreshDashboardSection(section));
  return res.data;
}

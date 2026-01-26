import { api } from "./client";
import { ENDPOINTS } from "./endpoints";

export async function getMe() {
  const res = await api.get(ENDPOINTS.me);
  return res.data; // { id, name, email, needsOnboarding }
}

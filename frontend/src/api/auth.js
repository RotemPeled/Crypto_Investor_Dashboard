import { api } from "./client";
import { ENDPOINTS } from "./endpoints";

export async function signup({ name, email, password }) {
  const res = await api.post(ENDPOINTS.signup, { name, email, password });
  return res.data; // { message, user_id }
}

export async function login({ email, password }) {
  const res = await api.post(ENDPOINTS.login, { email, password });
  return res.data; // { access_token, token_type }
}

import axios from "axios";

const baseURL =
  (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

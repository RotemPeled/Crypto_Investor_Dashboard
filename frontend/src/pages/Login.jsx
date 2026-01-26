import React, { useState } from "react";
import { login } from "../api/auth";
import { getMe } from "../api/me";
import { useAuth } from "../auth/AuthProvider";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();
  const { setSession } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await login(form); // { access_token, token_type }
      setSession(data.access_token);

      // חשוב: השרת שלך מחזיר needsOnboarding מ-/me
      const me = await getMe();
      nav(me.needsOnboarding ? "/onboarding" : "/dashboard");
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Login failed");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Login</h2>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 340 }}>
        <input placeholder="email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="password" type="password" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="submit">Enter</button>
      </form>

      {err && <p style={{ color: "red" }}>{err}</p>}
      <p><Link to="/signup">No account? Signup</Link></p>
    </div>
  );
}

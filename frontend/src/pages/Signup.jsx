import React, { useState } from "react";
import { signup } from "../api/auth";
import { Link, useNavigate } from "react-router-dom";

export default function Signup() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await signup(form);
      nav("/login");
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Signup failed");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Signup</h2>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 340 }}>
        <input placeholder="name" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="password" type="password" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />

        <button type="submit">Create account</button>
      </form>

      {err && <p style={{ color: "red" }}>{err}</p>}
      <p><Link to="/login">Already have an account? Login</Link></p>
    </div>
  );
}

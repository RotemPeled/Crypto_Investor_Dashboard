import React, { useState } from "react";
import { login } from "../api/auth";
import { getMe } from "../api/me";
import { useAuth } from "../auth/AuthProvider";
import { Link, useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { Field, Input, Button } from "../ui/Form";

export default function Login() {
  const nav = useNavigate();
  const { setSession } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await login(form);
      setSession(data.access_token);
      const me = await getMe();
      nav(me.needsOnboarding ? "/onboarding" : "/dashboard");
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Login failed");
    }
  }

  return (
    <Shell
      title="Welcome back"
      center
      width={560}
    >
      <div className="loginWrap">
        <form onSubmit={onSubmit} className="grid" style={{ gap: 12 }}>
          <Field label="Email">
            <Input
              placeholder="name@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field label="Password">
            <Input
              placeholder="••••••••"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>

          {err ? <div className="error">{err}</div> : null}

          <div className="formActions">
          <div className="formActionsLeft">
            Don't have an account? <Link to="/signup">Sign up</Link>
            </div>

            <div className="formActionsRight">
            <Button variant="primary" type="submit">Login</Button>
            </div>

          </div>

        </form>
      </div>
    </Shell>
  );
}

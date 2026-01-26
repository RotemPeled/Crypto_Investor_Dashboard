import React, { useState } from "react";
import { login } from "../api/auth";
import { getMe } from "../api/me";
import { useAuth } from "../auth/AuthProvider";
import { Link, useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { Field, Input, Button } from "../ui/Form";
import { useToast } from "../ui/ToastProvider";

export default function Login() {
  const nav = useNavigate();
  const { setSession } = useAuth();
  const { push } = useToast();

  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (loading) return;

    try {
      setLoading(true);
      const data = await login(form);
      setSession(data.access_token);

      push("Logged in successfully.", "success", 3000);
      const me = await getMe();

      setTimeout(() => {
        nav(me.needsOnboarding ? "/onboarding" : "/dashboard");
      }, 350);
    } catch (e2) {
      const msg = e2?.response?.data?.detail || "Login failed";
      setErr(msg);
      push(msg, "error", 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell title="Welcome back" center width={560}>
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
              <Button variant="primary" type="submit" disabled={loading}>
                {loading ? "Logging in…" : "Login"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Shell>
  );
}

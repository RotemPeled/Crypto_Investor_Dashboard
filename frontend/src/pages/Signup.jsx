import React, { useState } from "react";
import { signup } from "../api/auth";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import Shell from "../ui/Shell";
import { Field, Input, Button } from "../ui/Form";
import { useToast } from "../ui/ToastProvider";

export default function Signup() {
  const nav = useNavigate();
  const { setSession } = useAuth();
  const { push } = useToast();

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (loading) return;

    try {
      setLoading(true);
      const res = await signup(form);
      if (!res?.access_token) throw new Error("Signup did not return access_token");

      setSession(res.access_token);
      push("Account created successfully.", "success", 3000);

      setTimeout(() => nav("/onboarding"), 350);
    } catch (e2) {
      const msg = e2?.response?.data?.detail || e2.message || "Signup failed";
      setErr(msg);
      push(msg, "error", 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell title="Create account" center width={560}>
      <div className="grid" style={{ maxWidth: 520 }}>
        <form onSubmit={onSubmit} className="grid" style={{ gap: 12 }}>
          <div className="grid2">
            <Field label="Name">
              <Input
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="Email">
              <Input
                placeholder="name@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>

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
              Already have an account? <Link to="/login">Login</Link>
            </div>

            <div className="formActionsRight">
              <Button variant="primary" type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Shell>
  );
}

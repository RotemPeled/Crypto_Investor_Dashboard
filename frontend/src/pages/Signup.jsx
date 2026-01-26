import React, { useState } from "react";
import { signup } from "../api/auth";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import Shell from "../ui/Shell";
import { Field, Input, Button } from "../ui/Form";

export default function Signup() {
  const nav = useNavigate();
  const { setSession } = useAuth();

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    try {
      const res = await signup(form); // עכשיו השרת מחזיר access_token
      if (!res?.access_token) throw new Error("Signup did not return access_token");

      setSession(res.access_token);      // שומר token ב-localStorage
      nav("/onboarding");                // עובר ישר ל-onboarding
    } catch (e2) {
      setErr(e2?.response?.data?.detail || e2.message || "Signup failed");
    }
  }

  return (
    <Shell
      title="Create account"
      center
      width={560}
    >
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
                <Button variant="primary" type="submit">Create</Button>
            </div>
          </div>

        </form>
      </div>
    </Shell>
  );
}

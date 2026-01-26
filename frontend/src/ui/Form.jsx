import React from "react";

export function Field({ label, children }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function Button({ variant = "default", ...props }) {
  const cls =
    variant === "primary"
      ? "btn btnPrimary"
      : variant === "danger"
      ? "btn btnDanger"
      : "btn";
  return <button className={cls} {...props} />;
}

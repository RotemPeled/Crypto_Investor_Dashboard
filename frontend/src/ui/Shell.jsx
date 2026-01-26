import React from "react";
import ThemeToggle from "./ThemeToggle";

export default function Shell({
  title,
  subtitle,
  children,
  right,
  center = false,
  width = 1080,
}) {
  return (
    <div style={{ padding: "34px 0 56px" }}>
      <div className="container" style={{ width: `min(${width}px, calc(100% - 40px))` }}>
        <div className="shellTop">
          <div className="shellHeader" style={{ textAlign: center ? "center" : "left" }}>
            <h1 className="h1">{title}</h1>
            {subtitle ? <p className="sub">{subtitle}</p> : null}
          </div>

          <div className="shellRight">
            <ThemeToggle />
            {right ? right : null}
          </div>
        </div>

        <div className="card" style={{ marginLeft: center ? "auto" : 0, marginRight: center ? "auto" : 0 }}>
          <div className="cardInner">{children}</div>
        </div>
      </div>
    </div>
  );
}

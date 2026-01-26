import React from "react";
import { Link } from "react-router-dom";

export default function Shell({ title, subtitle, right, children }) {
  return (
    <div style={{ padding: "28px 0 48px" }}>
      <div className="container">
        <div className="row" style={{ marginBottom: 18 }}>
          <div>
            <h1 className="h1">{title}</h1>
            {subtitle ? <p className="sub">{subtitle}</p> : null}
          </div>
          {right ? <div>{right}</div> : <Link className="badge" to="/dashboard">Crypto Advisor</Link>}
        </div>

        <div className="card">
          <div className="cardInner">{children}</div>
        </div>
      </div>
    </div>
  );
}

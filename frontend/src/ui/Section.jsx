import React from "react";

export default function Section({ title, subtitle, headerRight, children }) {
  return (
    <div className="card">
      <div className="cardInner">
        <div className="sectionHeader">
          <div className="sectionHeaderLeft">
            <div className="sectionTitle">{title}</div>
            {subtitle ? <div className="sectionSub">{subtitle}</div> : null}
          </div>

          {headerRight ? <div className="sectionHeaderRight">{headerRight}</div> : null}
        </div>

        <hr className="hr" />
        {children}
      </div>
    </div>
  );
}

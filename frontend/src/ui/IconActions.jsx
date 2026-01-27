import React from "react";
import { ThumbsUp, ThumbsDown, RotateCw } from "lucide-react";

function IconBtn({
  onClick,
  disabled,
  title,
  ariaLabel,
  children,
  on = false,
  spin = false,
}) {
  return (
    <button
      className={`voteBtn ${on ? "voteBtnOn" : ""}`}
      onClick={onClick}
      type="button"
      disabled={disabled}
      title={title}
      aria-label={ariaLabel || title}
    >
      <span className={spin ? "spin" : ""} style={{ display: "inline-flex" }}>
        {children}
      </span>
    </button>
  );
}

export function RefreshIconButton({
  onClick,
  loading = false,
  disabled = false,
  title = "Refresh",
}) {
  return (
    <IconBtn
      onClick={onClick}
      disabled={disabled || loading}
      title={loading ? "Refreshing…" : title}
      ariaLabel="Refresh"
      spin={loading}
    >
      <RotateCw size={16} strokeWidth={1.6} />
    </IconBtn>
  );
}

export function VoteBar({
  onUp,
  onDown,
  selected = 0,
  disabled = false,
  className = "",
}) {
  const upDisabled = disabled || selected === 1;
  const downDisabled = disabled || selected === -1;

  return (
    <div className={`voteBar ${className}`}>
      <IconBtn
        onClick={onUp}
        disabled={upDisabled}
        title={selected === 1 ? "Already liked" : "Like"}
        ariaLabel="Like"
        on={selected === 1}
      >
        <ThumbsUp size={16} strokeWidth={1.6} />
      </IconBtn>

      <IconBtn
        onClick={onDown}
        disabled={downDisabled}
        title={selected === -1 ? "Already disliked" : "Dislike"}
        ariaLabel="Dislike"
        on={selected === -1}
      >
        <ThumbsDown size={16} strokeWidth={1.6} />
      </IconBtn>
    </div>
  );
}

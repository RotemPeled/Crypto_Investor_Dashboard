import React from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

export default function VoteBar({
  onUp,
  onDown,
  selected = 0,   // 1 / -1 / 0
  disabled = false,
  className = "",
}) {
  const upDisabled = disabled || selected === 1;
  const downDisabled = disabled || selected === -1;

  return (
    <div className={`voteBar ${className}`}>
      <button
        className={`voteBtn ${selected === 1 ? "voteBtnOn" : ""}`}
        onClick={onUp}
        aria-label="Like"
        type="button"
        disabled={upDisabled}
        title={selected === 1 ? "Already liked" : "Like"}
      >
        <ThumbsUp size={16} strokeWidth={1.6} />
      </button>

      <button
        className={`voteBtn ${selected === -1 ? "voteBtnOn" : ""}`}
        onClick={onDown}
        aria-label="Dislike"
        type="button"
        disabled={downDisabled}
        title={selected === -1 ? "Already disliked" : "Dislike"}
      >
        <ThumbsDown size={16} strokeWidth={1.6} />
      </button>
    </div>
  );
}

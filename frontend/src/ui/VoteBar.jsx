import React from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

export default function VoteBar({ onUp, onDown, className = "" }) {
  return (
    <div className={`voteBar ${className}`}>
      <button className="voteBtn" onClick={onUp} aria-label="Like" type="button">
        <ThumbsUp size={16} strokeWidth={1.6} />
      </button>
      <button className="voteBtn" onClick={onDown} aria-label="Dislike" type="button">
        <ThumbsDown size={16} strokeWidth={1.6} />
      </button>
    </div>
  );
}

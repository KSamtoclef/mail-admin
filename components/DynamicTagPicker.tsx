"use client";

import { Braces } from "lucide-react";
import { TEMPLATE_TAGS } from "@/lib/template-tags";

export default function DynamicTagPicker({
  onInsert,
  activeTarget
}: {
  onInsert: (token: string) => void;
  activeTarget: "subject" | "body";
}) {
  return (
    <section className="dynamicTags" aria-label="Dynamic tags">
      <div className="dynamicTagsHeader">
        <div>
          <strong><Braces size={14} /> Dynamic tags</strong>
          <span>Click a tag to insert it into the {activeTarget === "subject" ? "subject" : "message"}.</span>
        </div>
        <span className="dynamicTarget">Target: {activeTarget === "subject" ? "Subject" : "Message"}</span>
      </div>
      <div className="dynamicTagList">
        {TEMPLATE_TAGS.map((tag) => (
          <button
            key={tag.key}
            className="dynamicTagButton"
            type="button"
            title={tag.description}
            onClick={() => onInsert(tag.token)}
          >
            <span>{tag.label}</span>
            <code>{tag.token}</code>
          </button>
        ))}
      </div>
    </section>
  );
}

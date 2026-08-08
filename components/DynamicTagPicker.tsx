"use client";

import { Braces } from "lucide-react";
import { TEMPLATE_TAGS } from "@/lib/template-tags";
import styles from "./DynamicTagPicker.module.css";

export default function DynamicTagPicker({
  onInsert,
  activeTarget
}: {
  onInsert: (token: string) => void;
  activeTarget: "subject" | "body";
}) {
  return (
    <section className={styles.wrap} aria-label="Dynamic tags">
      <div className={styles.header}>
        <div>
          <strong><Braces size={14} /> Dynamic tags</strong>
          <span>Click a tag to insert it into the {activeTarget === "subject" ? "subject" : "message"}.</span>
        </div>
        <span className={styles.target}>Target: {activeTarget === "subject" ? "Subject" : "Message"}</span>
      </div>
      <div className={styles.list}>
        {TEMPLATE_TAGS.map((tag) => (
          <button
            key={tag.key}
            className={styles.button}
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

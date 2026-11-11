"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain-text letter → editor HTML: blank lines are paragraphs, single newlines are line breaks. */
export function textToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Editable letter. Kept to paragraphs and line breaks on purpose: the letter is
 * stored as text, cited with [S#] ids, and rendered into the evidence pack.
 */
export function LetterEditor({ initial, onChange }: { initial: string; onChange: (text: string) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        code: false,
        bold: false,
        italic: false,
        strike: false,
        link: false,
        underline: false,
      }),
    ],
    content: textToHtml(initial),
    editorProps: {
      attributes: {
        class: "prose-letter min-h-[28rem] text-[14.5px] leading-relaxed text-foreground outline-none [&_p]:mb-4",
        "aria-label": "Letter text",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getText({ blockSeparator: "\n\n" })),
  });
  useEffect(() => () => editor?.destroy(), [editor]);
  return <EditorContent editor={editor} />;
}

/** Client hints only. The upload route independently validates bytes and access. */
export const attachmentAccept = "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,text/markdown,.txt,.md,.csv";
export function attachmentError(file: Pick<File, "size" | "type">): string | null {
  if (!file.size || file.size > 3 * 1024 * 1024) return "Choose a nonempty file up to 3 MB.";
  if (!attachmentAccept.split(",").includes(file.type)) return "Supported files: JPEG, PNG, WebP, GIF, PDF, plain text, Markdown and CSV.";
  if (file.type.startsWith("text/") && file.size > 512 * 1024) return "Text files must be at most 512 KB.";
  return null;
}
export function mentionAt(text: string, caret: number) {
  const match = /(?:^|\s)@([a-z0-9_:]{0,29})$/i.exec(text.slice(0, caret));
  return match ? { query: match[1], start: caret - match[1].length - 1, end: caret } : null;
}
export const composerEmoji = [
  ["😀", "grin happy"], ["😂", "laugh joy"], ["❤️", "heart love"], ["👍", "thumbs up"],
  ["🙏", "prayer thanks"], ["🎮", "gaming controller"], ["🎉", "party celebrate"], ["🔥", "fire"],
  ["👀", "eyes look"], ["✅", "check done"], ["✨", "sparkles"], ["💪", "strong muscle"],
  ["😅", "sweat smile"], ["😭", "cry sad"], ["🙌", "praise hands"], ["🤝", "handshake team"],
  ["🕊️", "dove peace"], ["✝️", "cross faith"], ["🏆", "trophy win"], ["🚀", "rocket launch"],
  ["👋", "wave hello"], ["🤔", "thinking"], ["💜", "purple heart"], ["🎯", "target"],
] as const;

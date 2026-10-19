// "949 words 7,485 characters" for a text (used by the cover letter views)
export function countText(text: string): string {
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return `${words.toLocaleString("en-US")} words ${chars.toLocaleString("en-US")} characters`;
}

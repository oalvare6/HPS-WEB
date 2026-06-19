/**
 * Collapses whitespace/newlines and trims long copy down to a single clean
 * line for share sheets and OG/meta descriptions. Prefers cutting at the end
 * of the first sentence when that sentence fits within maxLen; otherwise
 * cuts at the last whole word and appends an ellipsis.
 */
export function summarizeText(raw: string, maxLen = 160): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLen) return collapsed;

  const candidate = collapsed.slice(0, maxLen);
  const sentenceMatch = candidate.match(/^[^.!?]*[.!?]/);
  if (sentenceMatch && sentenceMatch[0].length >= 20) {
    return sentenceMatch[0].trim();
  }

  const lastSpace = candidate.lastIndexOf(" ");
  const cut = lastSpace > 20 ? candidate.slice(0, lastSpace) : candidate;
  return `${cut.trim()}…`;
}

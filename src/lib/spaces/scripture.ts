// Curated passage references only. Translation rights are not assumed.
const verses = [
  {
    reference: "1 Peter 5:7",
  },
  {
    reference: "Psalm 133:1",
  },
  {
    reference: "Romans 12:10",
  },
  {
    reference: "1 Thessalonians 5:11",
  },
  {
    reference: "Proverbs 27:17",
  },
];
export function dailyScripture(day: string) {
  const stamp = Date.parse(day + "T00:00:00Z");
  const index = Number.isFinite(stamp)
    ? ((Math.floor(stamp / 86400000) % verses.length) + verses.length) %
      verses.length
    : 0;
  return verses[index];
}

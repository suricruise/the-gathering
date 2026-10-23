// Curated public-domain KJV excerpts. No fabricated member authors or generated posts.
const verses = [
  {
    text: "Casting all your care upon him; for he careth for you.",
    reference: "1 Peter 5:7",
  },
  {
    text: "Behold, how good and how pleasant it is for brethren to dwell together in unity!",
    reference: "Psalm 133:1",
  },
  {
    text: "Be kindly affectioned one to another with brotherly love; in honour preferring one another;",
    reference: "Romans 12:10",
  },
  {
    text: "Wherefore comfort yourselves together, and edify one another, even as also ye do.",
    reference: "1 Thessalonians 5:11",
  },
  {
    text: "Iron sharpeneth iron; so a man sharpeneth the countenance of his friend.",
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

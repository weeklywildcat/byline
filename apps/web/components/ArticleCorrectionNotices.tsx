import { formatDisplayDate } from "@/lib/format";
import { getCorrectionTypeLabel, type WordPressCorrection } from "@/lib/wordpress";

type ArticleCorrectionNoticesProps = {
  corrections: WordPressCorrection[];
};

export function ArticleCorrectionNotices({ corrections }: ArticleCorrectionNoticesProps) {
  // Legacy notices remain in the post HTML for backwards compatibility. They
  // are parsed for the update indicator/log, but must not be rendered a second
  // time by the structured notice surface.
  const structuredCorrections = corrections.filter((correction) => !correction.legacy);

  if (structuredCorrections.length === 0) {
    return null;
  }

  return (
    <section className="article-correction-notices" aria-label="Story corrections and updates">
      {structuredCorrections.map((correction) => (
        <aside className="article-correction-notice" key={correction.id}>
          <div className="article-correction-notice-heading">
            <h2>{getCorrectionTypeLabel(correction.type)}</h2>
            {correction.date ? <time dateTime={correction.date}>{formatDisplayDate(correction.date)}</time> : null}
          </div>
          <p>{correction.text}</p>
        </aside>
      ))}
    </section>
  );
}

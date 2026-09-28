import { SectionHeader } from "@/components/SectionHeader";
import { JsonLd } from "@/lib/seo";
import styles from "./QuickAnswers.module.css";

export interface QuickAnswer {
  q: string;
  a: string;
}

/** "Με μια ματιά": the questions people type into a search box or ask an
 *  assistant, answered in one sentence each from the page's own data, and
 *  marked up as an FAQPage. Assistants quote a direct answer to the question
 *  as asked; a table they have to read is a page they skip.
 *
 *  Nothing when there is nothing to say: an empty block is worse than none. */
export function QuickAnswers({ id, items }: { id: string; items: QuickAnswer[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.block} aria-labelledby={id}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map(({ q, a }) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }}
      />
      <SectionHeader id={id} title="ΜΕ ΜΙΑ ΜΑΤΙΑ" />
      <dl className={styles.list}>
        {items.map(({ q, a }) => (
          <div key={q} className={styles.item}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

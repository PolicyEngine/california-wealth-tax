import { RELATED_WORK } from "@/lib/relatedWork";

export default function RelatedWork() {
  return (
    <section
      aria-labelledby="related-work-heading"
      className="space-y-4 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]"
    >
      <div className="max-w-3xl">
        <h2
          id="related-work-heading"
          className="text-xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]"
        >
          Related work
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
          Two other analyses compare the published estimates. This calculator
          does not reproduce either paper&apos;s own calculation: its Berkeley
          and Hoover starting points apply each team&apos;s assumptions as
          settings inside one person-by-person model, on the same roster.
        </p>
      </div>
      <ul className="max-w-3xl space-y-4">
        {RELATED_WORK.map((work) => (
          <li key={work.id} className="text-sm leading-6 text-[var(--gray-600)]">
            <p>
              <span className="font-medium text-[var(--gray-700)]">{work.author}</span>,{" "}
              &ldquo;{work.title}&rdquo; ({work.venue}).
            </p>
            <p className="text-[var(--gray-500)]">{work.summary}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
              {work.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--teal-700)] underline-offset-2 hover:underline"
                >
                  {link.label}
                </a>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

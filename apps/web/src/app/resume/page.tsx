import { resume } from "@/lib/resume";
import { PrintButton } from "@/components/print-button";

export const metadata = {
  title: "Resume — Austen DeWolf",
};

export default function ResumePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 print:py-6">
      <div className="mb-10 flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Resume</h1>
          <p className="mt-2 text-muted-foreground">
            A snapshot of where I&apos;ve been and what I&apos;ve built.
          </p>
        </div>
        <PrintButton />
      </div>

      <article className="space-y-10 print:space-y-6 print:text-black">
        <header className="space-y-3 print:space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground print:text-black">
            {resume.name}
          </h2>
          <p className="font-mono text-xs text-muted-foreground print:text-gray-700">
            {resume.contact.email}
            {"  ·  "}
            {resume.contact.phone}
            {"  ·  "}
            <a
              href={`https://${resume.contact.linkedin}`}
              className="hover:text-accent"
            >
              {resume.contact.linkedin}
            </a>
          </p>
          <p className="text-sm italic text-muted-foreground print:text-gray-700">
            {resume.tagline.join("  |  ")}
          </p>
        </header>

        <Section title="Summary">
          <p className="text-sm leading-relaxed text-muted-foreground print:text-black">
            {resume.summary}
          </p>
        </Section>

        <Section title="Experience">
          <div className="space-y-6 print:space-y-4">
            {resume.experience.map((role) => (
              <Role key={`${role.company}-${role.dates}`} role={role} />
            ))}
          </div>
        </Section>

        <Section title="Founded">
          <div className="space-y-5 print:space-y-3">
            {resume.founded.map((item) => (
              <Founded key={item.name} item={item} />
            ))}
          </div>
        </Section>

        <Section title="Skills">
          <div className="space-y-2 print:space-y-1">
            {resume.skills.map((group) => (
              <p
                key={group.category}
                className="text-sm leading-relaxed print:text-black"
              >
                <span className="font-semibold text-foreground print:text-black">
                  {group.category}:
                </span>{" "}
                <span className="text-muted-foreground print:text-gray-800">
                  {group.items.join(", ")}
                </span>
              </p>
            ))}
          </div>
        </Section>

        <Section title="Education">
          <div className="text-sm print:text-black">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-semibold text-foreground print:text-black">
                {resume.education.school}
              </span>
              <span className="font-mono text-xs text-muted-foreground print:text-gray-700">
                {resume.education.dates}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground print:text-gray-800">
              {resume.education.degree}
            </p>
          </div>
        </Section>
      </article>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 border-b border-border/40 pb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground print:border-gray-400 print:text-black">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Role({ role }: { role: ResumeRoleType }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <span className="font-semibold text-foreground print:text-black">
            {role.title}
          </span>{" "}
          <span className="text-muted-foreground print:text-gray-700">
            · {role.company}
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground print:text-gray-700">
          {role.dates}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-xs text-muted-foreground print:text-gray-600">
        {role.location}
      </p>
      {role.bullets.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground print:text-black">
          {role.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Founded({ item }: { item: ResumeFoundedType }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <span className="font-semibold text-foreground print:text-black">
            {item.name}
          </span>{" "}
          <a
            href={`https://${item.link}`}
            className="font-mono text-xs text-accent hover:underline print:text-gray-700"
          >
            {item.link}
          </a>
        </div>
        <span className="font-mono text-xs text-muted-foreground print:text-gray-700">
          {item.dates}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-xs text-muted-foreground print:text-gray-600">
        {item.location}
      </p>
      <p className="mt-2 text-sm text-muted-foreground print:text-black">
        {item.description}
      </p>
    </div>
  );
}

type ResumeRoleType = (typeof resume.experience)[number];
type ResumeFoundedType = (typeof resume.founded)[number];

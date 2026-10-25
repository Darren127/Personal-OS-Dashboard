import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders the Companion's markdown safely (raw HTML is not allowed). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed break-words [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_table]:w-full [&_table]:text-left [&_table]:text-xs [&_td]:border-t [&_td]:py-1 [&_td]:pr-3 [&_th]:pr-3 [&_th]:pb-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Story paragraphs: a bit larger and looser than the UI text. */
export function StoryText({ lines }: { lines: string[] }) {
  return (
    <div className="flex max-w-[62ch] flex-col gap-3 text-[15px] leading-relaxed">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

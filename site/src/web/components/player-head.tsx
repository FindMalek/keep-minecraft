import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** A player's face (via the site's /heads proxy), their initial until it loads. */
export function PlayerHead({ uuid, name, className }: { uuid: string; name: string; className?: string }) {
  return (
    <Avatar className={cn("size-6 rounded-none after:rounded-none", className)} title={name}>
      <AvatarImage src={`/heads/${uuid}`} alt="" className="rounded-none [image-rendering:pixelated]" />
      <AvatarFallback className="rounded-none font-mono text-[10px]">{name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
}

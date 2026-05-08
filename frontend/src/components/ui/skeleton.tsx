import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "rounded-md bg-muted motion-safe:animate-pulse motion-reduce:opacity-60",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }

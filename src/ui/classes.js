/** Shared class strings — shadcn-like primitives without React. */

export const btn =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

export const btnOutline =
  btn +
  " border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground";

export const btnPrimary =
  btn + " bg-primary text-primary-foreground shadow-xs hover:bg-primary/90";

export const btnGhost =
  btn + " text-foreground hover:bg-accent hover:text-accent-foreground";

export const input =
  "flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 font-mono text-xs text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const badge =
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase";

export const badgeSecondary =
  badge + " border-transparent bg-secondary text-secondary-foreground";

export const badgeOutline = badge + " border-border text-foreground";

export const badgeDestructive =
  badge + " border-transparent bg-destructive/10 text-destructive";

export const card =
  "rounded-lg border border-border bg-card text-card-foreground shadow-xs";

export const muted = "text-sm text-muted-foreground";

export const sectionLabel =
  "text-[0.7rem] font-medium tracking-wider text-muted-foreground uppercase";

export const tabsList =
  "inline-flex h-7 items-center gap-0.5 rounded-lg bg-muted p-0.5";

export const tabsTrigger =
  "trail-filter-btn inline-flex h-6 items-center justify-center rounded-md px-2 text-[0.7rem] font-medium text-muted-foreground transition-colors";

export const tabsTriggerActive =
  tabsTrigger + " bg-background text-foreground shadow-xs";

export const tabsTriggerIdle =
  tabsTrigger + " hover:text-foreground";

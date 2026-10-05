// Shared 36px (h-9) control tokens for the Daily Operations forms, matching ui/input and ui/button.
// appearance-none: WebKit locks a native menulist's height to auto and ignores h-*, so draw our own chevron.
export const SELECT_CLASS =
  "flex h-9 w-full appearance-none rounded-md border border-input bg-transparent bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2016%2016%27%20fill=%27none%27%20stroke=%27%2371717a%27%20stroke-width=%271.5%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m4%206%204%204%204-4%27/%3E%3C/svg%3E)] bg-[length:1rem_1rem] bg-[position:right_0.625rem_center] bg-no-repeat py-1 pl-3 pr-8 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

// Matches ui/label typography; used on the <p> naming a role="group" quick-pick set (no fieldset/legend: Safari mislays legends).
export const QUICK_PICK_HEADING_CLASS = "text-sm font-medium leading-none";

// Fixed height + truncated label so the box never depends on text wrapping; wrap the label in QUICK_PICK_LABEL_CLASS.
export const QUICK_PICK_OPTION_CLASS =
  "flex h-9 min-w-0 cursor-pointer items-center gap-3 rounded-md border border-input px-3 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted";

export const QUICK_PICK_LABEL_CLASS = "min-w-0 truncate";

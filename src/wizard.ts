import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  select,
  text,
} from "@clack/prompts";
import {
  describeTailwind,
  detectPackageManager,
  executeSetup,
  planSetup,
  writeMigratedFiles,
} from "./setup.js";
import type { SetupOptions, SetupPlan } from "./setup.js";

const DOCS_BASE = "https://ui.shadcn.com/docs/components-json#base";
const DOCS_STYLES = "https://ui.shadcn.com/create";

// The official shadcn styles (--preset); primitives are chosen separately via --base.
const STYLE_OPTIONS = [
  { value: "vega", label: "Vega", hint: "classic shadcn look, balanced spacing (default)" },
  { value: "nova", label: "Nova", hint: "tighter padding — dashboards & admin panels" },
  { value: "maia", label: "Maia", hint: "large rounded radii, generous spacing — consumer apps" },
  { value: "lyra", label: "Lyra", hint: "zero radius, sharp & boxy — pairs with mono fonts" },
  { value: "mira", label: "Mira", hint: "most compact — dense, data-heavy UIs" },
  { value: "__custom__", label: "Custom preset…", hint: "paste a code from ui.shadcn.com" },
] as const;

type Mode = "setup" | "convert" | "preview";

function cancelled(): number {
  cancel("Cancelled — nothing was changed.");
  return 0;
}

/**
 * Interactive, guided entry point used when `mui-to-shadcn` is run with no path on a TTY.
 * Walks the user through the few real decisions, shows a full review, and only then runs.
 */
export async function runWizard(cwd: string): Promise<number> {
  intro("mui-to-shadcn — convert Material UI to shadcn/ui");
  note(
    [
      "This will (in order):",
      "  • set up Tailwind CSS if your project has none",
      "  • run shadcn init + add the components your code needs",
      "  • convert your MUI components, icons and sx props",
      "  • format the result with Prettier",
      "",
      "Nothing runs until you review and confirm.",
    ].join("\n"),
    "What happens",
  );

  const targetRaw = await text({
    message: "Which folder or file should I convert?",
    placeholder: "src",
    defaultValue: "src",
    validate: (value) => {
      const target = value?.trim() || "src";
      if (!existsSync(join(cwd, target))) return `Not found in this directory: ${target}`;
      return undefined;
    },
  });
  if (isCancel(targetRaw)) return cancelled();
  const target = (targetRaw || "src").trim() || "src";

  const mode = await select({
    message: "What should I do?",
    initialValue: "setup",
    options: [
      { value: "setup", label: "Full setup", hint: "install shadcn + Tailwind, convert, format (recommended)" },
      { value: "convert", label: "Convert files only", hint: "write converted files, run no installs" },
      { value: "preview", label: "Preview the plan", hint: "show everything, change nothing" },
    ],
  });
  if (isCancel(mode)) return cancelled();

  const base = await select({
    message: "Which component primitives?",
    initialValue: "radix",
    options: [
      { value: "radix", label: "Radix UI", hint: "the standard shadcn base (default)" },
      { value: "base", label: "Base UI", hint: "render props instead of asChild; stricter value types" },
    ],
  });
  if (isCancel(base)) return cancelled();
  log.info(`Base UI vs Radix: ${DOCS_BASE}`);

  const style = await select({
    message: "Which shadcn style?",
    initialValue: "vega",
    options: STYLE_OPTIONS.map((option) => ({ ...option })),
  });
  if (isCancel(style)) return cancelled();
  log.info(`Browse styles & themes: ${DOCS_STYLES}`);

  let presetOverride: string | undefined;
  let styleValue = style as string;
  if (style === "__custom__") {
    const code = await text({
      message: "Paste a preset name or code",
      placeholder: "e.g. nova or a ui.shadcn.com code like a2r6bw",
      validate: (value) => (value?.trim() ? undefined : "Enter a preset name or code"),
    });
    if (isCancel(code)) return cancelled();
    presetOverride = code.trim();
    styleValue = "vega"; // ignored once preset is set, but keeps options well-formed
  }

  let writeMd = true;
  if (mode !== "preview") {
    const md = await confirm({
      message: "Also write MIGRATION.md — an LLM-ready handoff for the parts left to do by hand?",
      initialValue: true,
    });
    if (isCancel(md)) return cancelled();
    writeMd = md;
  }

  const options: SetupOptions = {
    target: [target],
    base: base as "radix" | "base",
    style: styleValue,
    preset: presetOverride,
    packageManager: undefined,
    dryRun: mode === "preview",
    skipSx: false,
    skipTailwind: false,
    writeMd,
    cwd,
  };

  log.step(`Scanning ${target} — this can take a moment on large projects…`);
  const result = planSetup(options);
  if (!result.ok) {
    cancel(result.error);
    return 1;
  }
  const plan = result.plan;

  note(buildReview(plan, options, mode as Mode), "Review");

  if (mode === "preview") {
    outro("Preview only — nothing changed. Re-run and choose Full setup to apply.");
    return 0;
  }

  const proceed = await confirm({
    message:
      mode === "setup"
        ? "Run these steps now? Installs packages and writes files."
        : `Write ${plan.changedCount} converted file(s) now?`,
    initialValue: true,
  });
  if (isCancel(proceed) || !proceed) return cancelled();

  const status =
    mode === "setup"
      ? executeSetup(plan, cwd, options.base)
      : writeMigratedFiles(plan, cwd, options.base);

  if (status === 0) {
    outro("Done. Review the diff and check your app's visual QA.");
  } else {
    cancel("Stopped — see the error above.");
  }
  return status;
}

function buildReview(plan: SetupPlan, options: SetupOptions, mode: Mode): string {
  const manager = options.packageManager ?? detectPackageManager(options.cwd);
  const lines: string[] = [];
  lines.push(`Target            ${options.target.join(", ")}`);
  lines.push(`Base              ${options.base === "base" ? "Base UI" : "Radix UI"}`);
  lines.push(
    options.preset
      ? `Preset            ${plan.preset}  (custom)`
      : `Style             ${options.style}  (--preset ${plan.preset}, --base ${options.base})`,
  );
  lines.push(`Package manager   ${manager}`);
  lines.push(`Files to change   ${plan.changedCount} of ${plan.fileCount}`);
  lines.push(`Components (${plan.componentList.length})    ${plan.componentList.join(" ") || "none"}`);
  if (plan.tailwind.needed) {
    lines.push(`Tailwind          set up — ${describeTailwind(plan.tailwind)}`);
  } else {
    lines.push(`Tailwind          already configured (or skipped)`);
  }
  lines.push(
    plan.writeMd
      ? `MIGRATION.md      yes — ${plan.mdTasks} task(s) + ${plan.mdReviews} review note(s) for an LLM`
      : `MIGRATION.md      no${options.writeMd ? " (nothing left to hand off)" : ""}`,
  );
  lines.push("");

  if (mode === "convert") {
    lines.push(`Will write ${plan.changedCount} file(s). No packages installed, no shadcn init.`);
  } else {
    lines.push("Steps:");
    plan.steps.forEach((step, index) => lines.push(`  ${index + 1}. ${step}`));
  }

  if (plan.tailwind.notes.length) {
    lines.push("");
    lines.push("Heads-up:");
    for (const heads of plan.tailwind.notes) lines.push(`  • ${heads}`);
  }
  return lines.join("\n");
}

import { Project } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { ManualHit } from "./plan.js";
import { planFile } from "./plan.js";
import { applyEdits, resolveOverlaps } from "./edits.js";
import { buildImportBlock, buildImportEdits, insertImportBlock } from "./imports.js";
import { buildRegistry } from "./mappings.js";
import { sxFile } from "./sx.js";
import { iconsFile } from "./icons.js";
import { infraFile } from "./infra.js";
import { handlersFile } from "./handlers.js";

export interface MigrationResult {
  changed: boolean;
  text: string;
  warnings: string[];
  manual: ManualHit[];
  components: string[];
}

export interface MigrationOptions {
  sx?: boolean;
  base?: "radix" | "base";
}

const registry = buildRegistry();
const componentPathPrefix = "@/components/ui/";
const layoutComponents = new Set(["Box", "Stack", "Grid", "Grid2", "GridLegacy", "Container"]);

function collectComponents(imports: { moduleSpecifier: string }[]): string[] {
  const slugs = new Set<string>();
  for (const request of imports) {
    if (request.moduleSpecifier.startsWith(componentPathPrefix)) {
      slugs.add(request.moduleSpecifier.slice(componentPathPrefix.length));
    }
  }
  return [...slugs];
}

export function runMigration(sourceFile: SourceFile, options: MigrationOptions = {}): MigrationResult {
  const applySx = options.sx !== false;
  const base = options.base ?? "radix";
  const originalText = sourceFile.getFullText();
  const plan = planFile(sourceFile, originalText, registry, { base });

  const importEdits = buildImportEdits(sourceFile, plan.convertedCanonical, originalText);
  const { edits, dropped } = resolveOverlaps([...plan.edits, ...importEdits]);

  const warnings = [...plan.warnings];
  if (dropped.length) {
    warnings.push(
      `${dropped.length} overlapping edit(s) dropped; an enclosing element was converted as a block`,
    );
  }

  let text = applyEdits(originalText, edits);
  text = insertImportBlock(text, buildImportBlock(plan.imports));

  let manual = plan.manual;
  let activeWarnings = warnings;
  if (applySx) {
    manual = manual.filter((hit) => !layoutComponents.has(hit.component));
    activeWarnings = activeWarnings.filter((warning) => !warning.includes("layout component"));
  }

  // Infra pass: drop MUI/Emotion theme providers and baseline styles.
  {
    const project = new Project({ useInMemoryFileSystem: true });
    const infraSource = project.createSourceFile("__infra_pass__.tsx", text);
    const infraResult = infraFile(infraSource, text);
    text = infraResult.text;
    activeWarnings.push(...infraResult.warnings);
  }

  // Handler pass: rewrite inline arrow bodies for the renamed value/checked callbacks.
  {
    const project = new Project({ useInMemoryFileSystem: true });
    const handlerSource = project.createSourceFile("__handlers_pass__.tsx", text);
    text = handlersFile(handlerSource, text).text;
  }

  let needsCn = false;

  // Icon pass: @mui/icons-material -> lucide-react. Independent of material components,
  // so it runs whether or not anything else converted.
  {
    const project = new Project({ useInMemoryFileSystem: true });
    const iconSource = project.createSourceFile("__icons_pass__.tsx", text);
    const iconResult = iconsFile(iconSource, text);
    text = iconResult.text;
    activeWarnings.push(...iconResult.warnings);
    if (iconResult.needsCn) needsCn = true;
  }

  if (applySx) {
    const project = new Project({ useInMemoryFileSystem: true });
    const sxSource = project.createSourceFile("__sx_pass__.tsx", text);
    const sxResult = sxFile(sxSource, text);
    text = sxResult.text;
    activeWarnings.push(...sxResult.warnings);
    if (sxResult.needsCn) needsCn = true;
  }

  if (needsCn && !/from ["']@\/lib\/utils["']/.test(text)) {
    text = insertImportBlock(text, 'import { cn } from "@/lib/utils";');
  }

  return {
    changed: text !== originalText,
    text,
    warnings: activeWarnings,
    manual,
    components: collectComponents(plan.imports),
  };
}

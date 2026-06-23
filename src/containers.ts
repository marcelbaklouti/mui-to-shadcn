import { Node } from "ts-morph";
import type {
  CompositeTransform,
  ContainerContext,
  ContainerEdit,
  JsxElementLike,
  ParsedAttribute,
  ParsedElement,
} from "./types.js";
import { parseElement } from "./attributes.js";
import { renderAttribute, renderAttributeValue, valueAsChild } from "./render.js";
import {
  childJsxElements,
  closingElementRange,
  descendantJsxElements,
  getTagName,
  openingElementRange,
  renameTagEdits,
} from "./nodes.js";

function attribute(element: ParsedElement, name: string): ParsedAttribute | undefined {
  return element.attributes.find((entry) => entry.name === name);
}

function attributeString(element: ParsedElement, name: string): string | undefined {
  const found = attribute(element, name);
  return found && found.value.kind === "string" ? found.value.value : undefined;
}

function valueExpression(found: ParsedAttribute): string {
  if (found.value.kind === "expression") return `{${found.value.expression}}`;
  if (found.value.kind === "string") return `"${found.value.value}"`;
  return "{true}";
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function innerOf(node: JsxElementLike, fullText: string): string {
  if (!Node.isJsxElement(node)) return "";
  const start = node.getOpeningElement().getEnd();
  const end = node.getClosingElement().getStart();
  return fullText.slice(start, end).trim();
}

function consumeSubtree(context: ContainerContext, node: JsxElementLike): void {
  context.consume(node);
  for (const descendant of descendantJsxElements(node)) context.consume(descendant);
}

function emitWrap(
  context: ContainerContext,
  openTag: string,
  innerOpen: string,
  innerClose: string,
  closeTag: string,
): ContainerEdit[] {
  const open = openingElementRange(context.node);
  const close = closingElementRange(context.node);
  if (close) {
    return [
      { start: open.start, end: open.end, replacement: `${openTag}${innerOpen}` },
      { start: close.start, end: close.end, replacement: `${innerClose}${closeTag}` },
    ];
  }
  return [
    {
      start: context.node.getStart(),
      end: context.node.getEnd(),
      replacement: `${openTag}${innerOpen}${innerClose}${closeTag}`,
    },
  ];
}

function selfClosingMarker(context: ContainerContext): string {
  return closingElementRange(context.node) ? ">" : " />";
}

interface RootOptions {
  drop?: Set<string>;
  rename?: Map<string, string>;
  context: ContainerContext;
}

function renderRootAttributes(element: ParsedElement, options: RootOptions): string {
  const parts: string[] = [];
  for (const entry of element.attributes) {
    if (options.drop?.has(entry.name)) continue;
    const renamed = options.rename?.get(entry.name);
    if (renamed) {
      if (entry.value.kind === "boolean") parts.push(renamed);
      else parts.push(`${renamed}=${renderAttributeValue(entry.value)}`);
      continue;
    }
    if (entry.name === "sx") options.context.warn("sx retained; run the sx conversion step");
    parts.push(renderAttribute({ name: entry.name, value: entry.value }));
  }
  return parts.length ? " " + parts.join(" ") : "";
}

export function selectContainer(context: ContainerContext): ContainerEdit[] {
  const { element, node, indent } = context;
  context.registerImport({
    names: ["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"],
    moduleSpecifier: "@/components/ui/select",
  });

  if (attribute(element, "onChange")) {
    context.warn("Select onChange -> onValueChange; the handler now receives the value string instead of an event");
  }
  if (attribute(element, "multiple")) {
    context.warn("Select multiple: the shadcn Select is single-select; handle multi-select manually");
  }
  if (context.base === "base") {
    context.warn("Base UI Select: add an items prop on the root and nativeButton={false} on non-button triggers");
  }

  const placeholder = attributeString(element, "label");
  const rootAttributes = renderRootAttributes(element, {
    context,
    rename: new Map([["onChange", "onValueChange"]]),
    drop: new Set([
      "label",
      "labelId",
      "multiple",
      "variant",
      "size",
      "fullWidth",
      "displayEmpty",
      "input",
      "MenuProps",
      "IconComponent",
      "renderValue",
      "autoWidth",
      "id",
      "error",
    ]),
  });

  const placeholderText = placeholder ? ` placeholder="${placeholder}"` : "";
  if (!closingElementRange(node)) {
    context.warn("Select without options; add SelectItem elements");
  }
  const innerOpen = `\n${indent}  <SelectTrigger>\n${indent}    <SelectValue${placeholderText} />\n${indent}  </SelectTrigger>\n${indent}  <SelectContent>`;
  const innerClose = `${indent}  </SelectContent>\n${indent}`;
  return emitWrap(context, `<Select${rootAttributes}>`, innerOpen, innerClose, "</Select>");
}

export function accordionContainer(context: ContainerContext): ContainerEdit[] {
  const { element, node, indent } = context;
  context.registerImport({
    names: ["Accordion", "AccordionContent", "AccordionItem", "AccordionTrigger"],
    moduleSpecifier: "@/components/ui/accordion",
  });
  if (attribute(element, "expanded") || attribute(element, "onChange") || attribute(element, "defaultExpanded")) {
    context.warn("Accordion expanded/onChange dropped; shadcn is controlled via value (type single/multiple)");
  }

  const edits: ContainerEdit[] = emitWrap(
    context,
    `<Accordion type="single" collapsible>`,
    `\n${indent}  <AccordionItem value="item-1">`,
    `${indent}  </AccordionItem>\n${indent}`,
    "</Accordion>",
  );

  for (const child of childJsxElements(node)) {
    const canonical = context.localToCanonical.get(getTagName(child));
    if (canonical === "AccordionSummary") {
      const childElement = parseElement(child, context.fullText);
      if (attribute(childElement, "expandIcon")) {
        context.warn("AccordionSummary expandIcon dropped; AccordionTrigger ships its own chevron");
      }
      const childOpen = openingElementRange(child);
      const childClose = closingElementRange(child);
      edits.push({ start: childOpen.start, end: childOpen.end, replacement: "<AccordionTrigger>" });
      if (childClose) edits.push({ start: childClose.start, end: childClose.end, replacement: "</AccordionTrigger>" });
      context.consume(child);
      context.markConverted("AccordionSummary");
    } else if (canonical === "AccordionDetails") {
      const childOpen = openingElementRange(child);
      const childClose = closingElementRange(child);
      edits.push({ start: childOpen.start, end: childOpen.end, replacement: "<AccordionContent>" });
      if (childClose) edits.push({ start: childClose.start, end: childClose.end, replacement: "</AccordionContent>" });
      context.consume(child);
      context.markConverted("AccordionDetails");
    } else if (canonical === "AccordionActions") {
      context.warn("AccordionActions has no equivalent; move the actions into AccordionContent");
    }
  }
  return edits;
}

export function tabsContainer(context: ContainerContext): ContainerEdit[] {
  const { element, node, indent } = context;
  context.registerImport({
    names: ["Tabs", "TabsContent", "TabsList", "TabsTrigger"],
    moduleSpecifier: "@/components/ui/tabs",
  });
  if (attribute(element, "onChange")) {
    context.warn("Tabs onChange -> onValueChange; the handler now receives the value instead of an event");
  }
  context.warn("Tab panels live outside Tabs in MUI; add matching TabsContent elements with a value");

  const rootAttributes = renderRootAttributes(element, {
    context,
    rename: new Map([["onChange", "onValueChange"]]),
    drop: new Set([
      "variant",
      "centered",
      "textColor",
      "indicatorColor",
      "scrollButtons",
      "allowScrollButtonsMobile",
      "orientation",
      "TabIndicatorProps",
      "selectionFollowsFocus",
    ]),
  });

  const edits: ContainerEdit[] = emitWrap(
    context,
    `<Tabs${rootAttributes}>`,
    `\n${indent}  <TabsList>`,
    `${indent}  </TabsList>\n${indent}`,
    "</Tabs>",
  );

  for (const child of childJsxElements(node)) {
    const canonical = context.localToCanonical.get(getTagName(child));
    if (canonical !== "Tab") continue;
    const childElement = parseElement(child, context.fullText);
    const valueAttribute = attribute(childElement, "value");
    const labelAttribute = attribute(childElement, "label");
    if (!valueAttribute) context.warn("Tab without value; TabsTrigger requires a value");
    if (attribute(childElement, "icon")) context.warn("Tab icon: move the icon into the TabsTrigger children");
    const valueText = valueAttribute ? ` value=${renderAttributeValue(valueAttribute.value)}` : "";
    const labelText = labelAttribute
      ? valueAsChild(labelAttribute.value)
      : Node.isJsxElement(child)
        ? innerOf(child, context.fullText)
        : "";
    consumeSubtree(context, child);
    context.markConverted("Tab");
    edits.push({
      start: child.getStart(),
      end: child.getEnd(),
      replacement: `<TabsTrigger${valueText}>${labelText}</TabsTrigger>`,
    });
  }
  return edits;
}

export function radioGroupContainer(context: ContainerContext): ContainerEdit[] {
  const { element, node, indent } = context;
  context.registerImport({ names: ["RadioGroup", "RadioGroupItem"], moduleSpecifier: "@/components/ui/radio-group" });
  context.registerImport({ names: ["Label"], moduleSpecifier: "@/components/ui/label" });
  if (attribute(element, "onChange")) {
    context.warn("RadioGroup onChange -> onValueChange; the handler now receives the value instead of an event");
  }

  const rootAttributes = renderRootAttributes(element, {
    context,
    rename: new Map([["onChange", "onValueChange"]]),
    drop: new Set(["row"]),
  });
  if (attribute(element, "row")) context.warn("RadioGroup row dropped; set the orientation via classes");

  const open = openingElementRange(node);
  const edits: ContainerEdit[] = [
    { start: open.start, end: open.end, replacement: `<RadioGroup${rootAttributes}${selfClosingMarker(context)}` },
  ];

  for (const child of childJsxElements(node)) {
    const canonical = context.localToCanonical.get(getTagName(child));
    if (canonical !== "FormControlLabel") continue;
    const childElement = parseElement(child, context.fullText);
    const valueAttribute = attribute(childElement, "value");
    const labelAttribute = attribute(childElement, "label");
    const value = valueAttribute && valueAttribute.value.kind === "string" ? valueAttribute.value.value : undefined;
    const labelString = labelAttribute && labelAttribute.value.kind === "string" ? labelAttribute.value.value : undefined;
    const id = value ? slug(value) : labelString ? slug(labelString) : undefined;
    const valueText = valueAttribute ? ` value=${renderAttributeValue(valueAttribute.value)}` : "";
    const idText = id ? ` id="${id}"` : "";
    const labelChild = labelAttribute ? valueAsChild(labelAttribute.value) : "";
    if (!id) context.warn("FormControlLabel without a static value/label; set the id for Label/RadioGroupItem manually");
    consumeSubtree(context, child);
    context.markConverted("FormControlLabel");
    context.markConverted("Radio");
    edits.push({
      start: child.getStart(),
      end: child.getEnd(),
      replacement: [
        `<div className="flex items-center space-x-2">`,
        `${indent}    <RadioGroupItem${valueText}${idText} />`,
        `${indent}    <Label htmlFor="${id ?? ""}">${labelChild}</Label>`,
        `${indent}  </div>`,
      ].join("\n"),
    });
  }
  return edits;
}

export function dialogContainer(context: ContainerContext): ContainerEdit[] {
  const { element, node, indent } = context;
  if (attribute(element, "onClose")) {
    context.warn("Dialog onClose -> onOpenChange; the handler now receives a boolean instead of (event, reason)");
  }
  if (attribute(element, "slotProps") || attribute(element, "slots") || attribute(element, "PaperProps")) {
    context.warn("Dialog slotProps/PaperProps dropped; apply paper styling via className on DialogContent");
  }

  const rootAttributes = renderRootAttributes(element, {
    context,
    rename: new Map([["onClose", "onOpenChange"]]),
    drop: new Set([
      "fullWidth",
      "maxWidth",
      "scroll",
      "fullScreen",
      "TransitionComponent",
      "PaperProps",
      "BackdropProps",
      "disableEscapeKeyDown",
      "keepMounted",
      "slotProps",
      "slots",
    ]),
  });

  const edits: ContainerEdit[] = emitWrap(
    context,
    `<Dialog${rootAttributes}>`,
    `\n${indent}  <DialogContent>`,
    `${indent}  </DialogContent>\n${indent}`,
    "</Dialog>",
  );

  // Import only the dialog parts we actually emit, so the file is free of unused imports.
  const used = new Set<string>(["Dialog", "DialogContent"]);
  for (const descendant of descendantJsxElements(node)) {
    const canonical = context.localToCanonical.get(getTagName(descendant));
    if (canonical === "DialogTitle") {
      edits.push(...renameTagEdits(descendant, "DialogTitle"));
      used.add("DialogTitle");
      context.consume(descendant);
      context.markConverted("DialogTitle");
    } else if (canonical === "DialogContentText") {
      edits.push(...renameTagEdits(descendant, "DialogDescription"));
      used.add("DialogDescription");
      context.consume(descendant);
      context.markConverted("DialogContentText");
    } else if (canonical === "DialogActions") {
      edits.push(...renameTagEdits(descendant, "DialogFooter"));
      used.add("DialogFooter");
      context.consume(descendant);
      context.markConverted("DialogActions");
    } else if (canonical === "DialogContent") {
      const childOpen = openingElementRange(descendant);
      const childClose = closingElementRange(descendant);
      edits.push({ start: childOpen.start, end: childOpen.end, replacement: "" });
      if (childClose) edits.push({ start: childClose.start, end: childClose.end, replacement: "" });
      context.consume(descendant);
      context.markConverted("DialogContent");
    }
  }

  context.registerImport({ names: [...used], moduleSpecifier: "@/components/ui/dialog" });
  if (used.has("DialogTitle")) {
    context.warn("optional: wrap DialogTitle (and any DialogDescription) in a DialogHeader for shadcn spacing");
  }
  return edits;
}

export function toggleGroupContainer(context: ContainerContext): ContainerEdit[] {
  const { element, node, indent } = context;
  context.registerImport({ names: ["ToggleGroup", "ToggleGroupItem"], moduleSpecifier: "@/components/ui/toggle-group" });
  if (attribute(element, "onChange")) {
    context.warn("ToggleButtonGroup onChange -> onValueChange; the handler now receives the value instead of (event, value)");
  }

  const exclusive = attribute(element, "exclusive");
  const type = exclusive ? "single" : "multiple";
  const rootAttributes = renderRootAttributes(element, {
    context,
    rename: new Map([["onChange", "onValueChange"]]),
    drop: new Set(["exclusive", "size", "color", "orientation"]),
  });

  const open = openingElementRange(node);
  const edits: ContainerEdit[] = [
    { start: open.start, end: open.end, replacement: `<ToggleGroup type="${type}"${rootAttributes}${selfClosingMarker(context)}` },
  ];

  for (const child of childJsxElements(node)) {
    const canonical = context.localToCanonical.get(getTagName(child));
    if (canonical !== "ToggleButton") continue;
    edits.push(...renameTagEdits(child, "ToggleGroupItem"));
    context.consume(child);
    context.markConverted("ToggleButton");
  }
  void indent;
  return edits;
}

export function drawerContainer(context: ContainerContext): ContainerEdit[] {
  const { element, node, indent } = context;
  context.registerImport({ names: ["Sheet", "SheetContent"], moduleSpecifier: "@/components/ui/sheet" });
  if (attribute(element, "onClose")) {
    context.warn("Drawer onClose -> onOpenChange; the handler now receives a boolean instead of (event, reason)");
  }
  context.warn("Sheet may need a SheetTrigger");

  const side = attributeString(element, "anchor") ?? "left";
  const rootAttributes = renderRootAttributes(element, {
    context,
    rename: new Map([["onClose", "onOpenChange"]]),
    drop: new Set(["anchor", "variant", "elevation", "ModalProps", "PaperProps", "hideBackdrop", "transitionDuration", "onOpen", "disableBackdropTransition", "disableDiscovery", "swipeAreaWidth"]),
  });

  const edits: ContainerEdit[] = emitWrap(
    context,
    `<Sheet${rootAttributes}>`,
    `\n${indent}  <SheetContent side="${side}">`,
    `${indent}  </SheetContent>\n${indent}`,
    "</Sheet>",
  );
  return edits;
}

export function breadcrumbsContainer(context: ContainerContext): ContainerEdit[] {
  const { node, indent } = context;
  context.registerImport({
    names: [
      "Breadcrumb",
      "BreadcrumbItem",
      "BreadcrumbLink",
      "BreadcrumbList",
      "BreadcrumbPage",
      "BreadcrumbSeparator",
    ],
    moduleSpecifier: "@/components/ui/breadcrumb",
  });

  const children = childJsxElements(node);
  const items: string[] = [];
  children.forEach((child, index) => {
    const canonical = context.localToCanonical.get(getTagName(child));
    const childElement = parseElement(child, context.fullText);
    const inner = Node.isJsxElement(child) ? innerOf(child, context.fullText) : "";
    const isLast = index === children.length - 1;
    if (canonical === "Link" && !isLast) {
      const href = attribute(childElement, "href");
      const hrefText = href ? ` href=${renderAttributeValue(href.value)}` : "";
      items.push(`${indent}    <BreadcrumbItem>\n${indent}      <BreadcrumbLink${hrefText}>${inner}</BreadcrumbLink>\n${indent}    </BreadcrumbItem>`);
    } else {
      items.push(`${indent}    <BreadcrumbItem>\n${indent}      <BreadcrumbPage>${inner}</BreadcrumbPage>\n${indent}    </BreadcrumbItem>`);
    }
    if (canonical) context.markConverted(canonical);
    consumeSubtree(context, child);
  });

  const separator = `\n${indent}    <BreadcrumbSeparator />\n`;
  const body = items.join(separator);
  const replacement = `<Breadcrumb>\n${indent}  <BreadcrumbList>\n${body}\n${indent}  </BreadcrumbList>\n${indent}</Breadcrumb>`;
  return [{ start: node.getStart(), end: node.getEnd(), replacement }];
}

export function tableHeadContainer(context: ContainerContext): ContainerEdit[] {
  const { node } = context;
  context.registerImport({ names: ["TableHead", "TableHeader"], moduleSpecifier: "@/components/ui/table" });
  const edits: ContainerEdit[] = [...renameTagEdits(node, "TableHeader")];
  for (const descendant of descendantJsxElements(node)) {
    const canonical = context.localToCanonical.get(getTagName(descendant));
    if (canonical === "TableCell") {
      edits.push(...renameTagEdits(descendant, "TableHead"));
      context.consume(descendant);
      context.markConverted("TableCell");
    }
  }
  return edits;
}

export function tooltipContainer(context: ContainerContext): ContainerEdit[] {
  const { element, indent } = context;
  context.registerImport({
    names: ["Tooltip", "TooltipContent", "TooltipProvider", "TooltipTrigger"],
    moduleSpecifier: "@/components/ui/tooltip",
  });
  const title = attribute(element, "title");
  const placement = attributeString(element, "placement");
  const rawSide = placement ? (placement.split("-")[0] ?? "top") : "top";
  const side = ["top", "bottom", "left", "right"].includes(rawSide) ? rawSide : "top";
  const titleChild = title ? valueAsChild(title.value) : "";
  if (!title) context.warn("Tooltip without title; add the TooltipContent manually");

  const triggerOpen = context.base === "base" ? "<TooltipTrigger>" : "<TooltipTrigger asChild>";
  if (context.base === "base") {
    context.warn("Base UI: TooltipTrigger does not use asChild; use the render prop instead");
  }
  const innerOpen = `\n${indent}  <Tooltip>\n${indent}    ${triggerOpen}`;
  const innerClose = `${indent}    </TooltipTrigger>\n${indent}    <TooltipContent side="${side}">${titleChild}</TooltipContent>\n${indent}  </Tooltip>\n${indent}`;
  return emitWrap(context, "<TooltipProvider>", innerOpen, innerClose, "</TooltipProvider>");
}

export const textFieldTransform: CompositeTransform = (context) => {
  const element = context.element;
  const multiline = Boolean(attribute(element, "multiline"));
  const fieldTag = multiline ? "Textarea" : "Input";
  context.registerImport({ names: ["Label"], moduleSpecifier: "@/components/ui/label" });
  context.registerImport({
    names: [fieldTag],
    moduleSpecifier: multiline ? "@/components/ui/textarea" : "@/components/ui/input",
  });

  const label = attribute(element, "label");
  const helper = attribute(element, "helperText");
  const idAttribute = attribute(element, "id");
  let id: string | undefined =
    idAttribute && idAttribute.value.kind === "string" ? idAttribute.value.value : undefined;
  if (!id && label && label.value.kind === "string") id = slug(label.value.value);

  const consumed = new Set([
    "label",
    "helperText",
    "multiline",
    "variant",
    "margin",
    "fullWidth",
    "InputProps",
    "InputLabelProps",
    "FormHelperTextProps",
    "SelectProps",
    "select",
    "error",
    "id",
    "rows",
    "minRows",
    "maxRows",
    "focused",
    "color",
  ]);

  const fieldParts: string[] = [];
  if (id) fieldParts.push(`id="${id}"`);
  if (multiline) {
    const rows = attribute(element, "rows") ?? attribute(element, "minRows");
    if (rows) fieldParts.push(`rows=${renderAttributeValue(rows.value)}`);
  }
  for (const entry of element.attributes) {
    if (consumed.has(entry.name)) continue;
    if (entry.name === "sx") context.warn("sx retained; run the sx conversion step");
    fieldParts.push(renderAttribute({ name: entry.name, value: entry.value }));
  }

  if (attribute(element, "select")) context.warn("TextField select: use the Select pattern instead");
  if (attribute(element, "error")) context.warn("TextField error: add error styling and FormMessage manually");
  if (label && !id) {
    context.warn("TextField without a static label/id; link Label and field manually via htmlFor/id");
  }

  const fieldAttributes = fieldParts.length ? " " + fieldParts.join(" ") : "";
  const wrapperClass = attribute(element, "fullWidth")
    ? "grid w-full items-center gap-1.5"
    : "grid items-center gap-1.5";

  const lines = [`<div className="${wrapperClass}">`];
  if (label) lines.push(`  <Label htmlFor="${id ?? ""}">${valueAsChild(label.value)}</Label>`);
  lines.push(`  <${fieldTag}${fieldAttributes} />`);
  if (helper) lines.push(`  <p className="text-sm text-muted-foreground">${valueAsChild(helper.value)}</p>`);
  lines.push("</div>");
  return lines.join("\n");
};

export function menuContainer(context: ContainerContext): ContainerEdit[] {
  const { element, node, indent } = context;
  context.registerImport({
    names: [
      "DropdownMenu",
      "DropdownMenuContent",
      "DropdownMenuItem",
      "DropdownMenuSeparator",
      "DropdownMenuTrigger",
    ],
    moduleSpecifier: "@/components/ui/dropdown-menu",
  });
  if (attribute(element, "anchorEl")) {
    context.warn("Menu anchorEl dropped; replace the DropdownMenuTrigger with your trigger element");
  }
  if (attribute(element, "onClose")) {
    context.warn("Menu onClose -> onOpenChange; the handler now receives a boolean");
  }

  const rootAttributes = renderRootAttributes(element, {
    context,
    rename: new Map([["onClose", "onOpenChange"]]),
    drop: new Set([
      "anchorEl",
      "anchorOrigin",
      "transformOrigin",
      "keepMounted",
      "TransitionComponent",
      "transitionDuration",
      "variant",
      "id",
      "MenuListProps",
      "PaperProps",
      "slotProps",
      "elevation",
      "getContentAnchorEl",
      "autoFocus",
      "disableAutoFocusItem",
      "marginThreshold",
    ]),
  });

  const innerOpen = `\n${indent}  <DropdownMenuTrigger>Menu</DropdownMenuTrigger>\n${indent}  <DropdownMenuContent>`;
  const innerClose = `${indent}  </DropdownMenuContent>\n${indent}`;
  const edits = emitWrap(context, `<DropdownMenu${rootAttributes}>`, innerOpen, innerClose, "</DropdownMenu>");

  for (const descendant of descendantJsxElements(node)) {
    const canonical = context.localToCanonical.get(getTagName(descendant));
    if (canonical === "MenuItem") {
      edits.push(...renameTagEdits(descendant, "DropdownMenuItem"));
      context.consume(descendant);
      context.markConverted("MenuItem");
    } else if (canonical === "Divider") {
      edits.push(...renameTagEdits(descendant, "DropdownMenuSeparator"));
      context.consume(descendant);
      context.markConverted("Divider");
    }
  }
  return edits;
}

export function popoverContainer(context: ContainerContext): ContainerEdit[] {
  const { element } = context;
  context.registerImport({
    names: ["Popover", "PopoverContent", "PopoverTrigger"],
    moduleSpecifier: "@/components/ui/popover",
  });
  if (attribute(element, "anchorEl")) {
    context.warn("Popover anchorEl dropped; replace the PopoverTrigger with your trigger element");
  }
  if (attribute(element, "onClose")) {
    context.warn("Popover onClose -> onOpenChange; the handler now receives a boolean");
  }

  const rootAttributes = renderRootAttributes(element, {
    context,
    rename: new Map([["onClose", "onOpenChange"]]),
    drop: new Set([
      "anchorEl",
      "anchorOrigin",
      "transformOrigin",
      "elevation",
      "PaperProps",
      "slotProps",
      "marginThreshold",
      "keepMounted",
      "disableRestoreFocus",
      "container",
      "id",
      "TransitionComponent",
      "transitionDuration",
    ]),
  });

  const { indent } = context;
  const innerOpen = `\n${indent}  <PopoverTrigger>Open</PopoverTrigger>\n${indent}  <PopoverContent>`;
  const innerClose = `${indent}  </PopoverContent>\n${indent}`;
  return emitWrap(context, `<Popover${rootAttributes}>`, innerOpen, innerClose, "</Popover>");
}

export function modalContainer(context: ContainerContext): ContainerEdit[] {
  const { element, indent } = context;
  context.registerImport({ names: ["Dialog", "DialogContent"], moduleSpecifier: "@/components/ui/dialog" });
  if (attribute(element, "onClose")) {
    context.warn("Modal onClose -> onOpenChange; the handler now receives a boolean");
  }
  context.warn("Modal -> Dialog; add DialogTrigger and DialogHeader if needed");

  const rootAttributes = renderRootAttributes(element, {
    context,
    rename: new Map([["onClose", "onOpenChange"]]),
    drop: new Set([
      "aria-labelledby",
      "aria-describedby",
      "disableEnforceFocus",
      "disableAutoFocus",
      "disableEscapeKeyDown",
      "disableRestoreFocus",
      "keepMounted",
      "closeAfterTransition",
      "container",
      "slots",
      "slotProps",
      "BackdropComponent",
      "BackdropProps",
      "hideBackdrop",
    ]),
  });

  return emitWrap(
    context,
    `<Dialog${rootAttributes}>`,
    `\n${indent}  <DialogContent>`,
    `${indent}  </DialogContent>\n${indent}`,
    "</Dialog>",
  );
}

export function collapseContainer(context: ContainerContext): ContainerEdit[] {
  const { element, indent } = context;
  context.registerImport({
    names: ["Collapsible", "CollapsibleContent"],
    moduleSpecifier: "@/components/ui/collapsible",
  });
  context.warn("Collapse -> Collapsible; add a CollapsibleTrigger");

  const rootAttributes = renderRootAttributes(element, {
    context,
    rename: new Map([["in", "open"]]),
    drop: new Set([
      "orientation",
      "collapsedSize",
      "timeout",
      "component",
      "addEndListener",
      "easing",
      "mountOnEnter",
      "unmountOnExit",
      "appear",
    ]),
  });

  return emitWrap(
    context,
    `<Collapsible${rootAttributes}>`,
    `\n${indent}  <CollapsibleContent>`,
    `${indent}  </CollapsibleContent>\n${indent}`,
    "</Collapsible>",
  );
}

export function unwrapContainer(label: string): (context: ContainerContext) => ContainerEdit[] {
  return (context) => {
    context.warn(`${label} dropped; the content is preserved`);
    const open = openingElementRange(context.node);
    const close = closingElementRange(context.node);
    if (!close) {
      return [{ start: context.node.getStart(), end: context.node.getEnd(), replacement: "" }];
    }
    return [
      { start: open.start, end: open.end, replacement: "" },
      { start: close.start, end: close.end, replacement: "" },
    ];
  };
}

export const formHelperTextTransform: CompositeTransform = (context) => {
  const element = context.element;
  const error = attribute(element, "error");
  const className = error ? "text-sm text-destructive" : "text-sm text-muted-foreground";
  const inner = context.element.hasChildren ? context.element.innerText.trim() : "";
  return `<p className="${className}">${inner}</p>`;
};

export const listItemTextTransform: CompositeTransform = (context) => {
  const element = context.element;
  const primary = attribute(element, "primary");
  const secondary = attribute(element, "secondary");
  const primaryContent = primary
    ? valueAsChild(primary.value)
    : context.element.hasChildren
      ? context.element.innerText.trim()
      : "";
  const lines = [`<div className="flex flex-col">`, `  <span>${primaryContent}</span>`];
  if (secondary) {
    lines.push(`  <span className="text-sm text-muted-foreground">${valueAsChild(secondary.value)}</span>`);
  }
  lines.push("</div>");
  return lines.join("\n");
};

function sizeClassFromPx(raw: string): string {
  const px = Number.parseFloat(raw);
  if (Number.isNaN(px)) return `size-[${raw}]`;
  const scaled = px / 4;
  return Number.isInteger(scaled) ? `size-${scaled}` : `size-[${px}px]`;
}

export const circularProgressTransform: CompositeTransform = (context) => {
  context.registerImport({ names: ["Loader2"], moduleSpecifier: "lucide-react" });
  const element = context.element;
  const size = attribute(element, "size");
  let sizeClass = "size-10";
  if (size) {
    if (size.value.kind === "expression" && /^\d+(\.\d+)?$/.test(size.value.expression.trim())) {
      sizeClass = sizeClassFromPx(size.value.expression.trim());
    } else if (size.value.kind === "string") {
      sizeClass = /^\d+(\.\d+)?$/.test(size.value.value) ? sizeClassFromPx(size.value.value) : `size-[${size.value.value}]`;
    }
  }
  if (attribute(element, "variant") || attribute(element, "value")) {
    context.warn("CircularProgress determinate (value) dropped; a spinner shows no progress");
  }
  return `<Loader2 className="${sizeClass} animate-spin" />`;
};

export const paginationTransform: CompositeTransform = (context) => {
  context.registerImport({
    names: [
      "Pagination",
      "PaginationContent",
      "PaginationEllipsis",
      "PaginationItem",
      "PaginationLink",
      "PaginationNext",
      "PaginationPrevious",
    ],
    moduleSpecifier: "@/components/ui/pagination",
  });
  context.warn("Pagination: shadcn uses static markup; render pages from count manually (e.g. Array.from({ length: count }))");
  return [
    "<Pagination>",
    "  <PaginationContent>",
    '    <PaginationItem><PaginationPrevious href="#" /></PaginationItem>',
    '    <PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem>',
    "    <PaginationItem><PaginationEllipsis /></PaginationItem>",
    '    <PaginationItem><PaginationNext href="#" /></PaginationItem>',
    "  </PaginationContent>",
    "</Pagination>",
  ].join("\n");
};

export function badgeContainer(context: ContainerContext): ContainerEdit[] {
  const { element, indent } = context;
  context.registerImport({ names: ["Badge"], moduleSpecifier: "@/components/ui/badge" });

  const content = attribute(element, "badgeContent");
  const variant = attributeString(element, "variant");
  const color = attributeString(element, "color");
  if (attribute(element, "anchorOrigin") || attribute(element, "overlap")) {
    context.warn("Badge anchorOrigin/overlap dropped; adjust the badge position via classes");
  }
  if (attribute(element, "max")) context.warn("Badge max dropped; implement the cap manually");

  const badgeVariant = color === "error" ? ' variant="destructive"' : color === "secondary" ? ' variant="secondary"' : "";
  const isDot = variant === "dot";
  const badgeClass = isDot ? "absolute -right-1 -top-1 size-2 rounded-full p-0" : "absolute -right-2 -top-2";
  const badgeInner = isDot ? "" : content ? valueAsChild(content.value) : "";

  const innerClose = `\n${indent}  <Badge${badgeVariant} className="${badgeClass}">${badgeInner}</Badge>\n${indent}`;
  return emitWrap(context, `<span className="relative inline-flex">`, "", innerClose, "</span>");
}

export function snackbarContainer(context: ContainerContext): ContainerEdit[] {
  const { element, node } = context;
  const message = attributeString(element, "message");
  const messageHint = message ? ` toast("${message}")` : " toast()";
  context.warn(`Snackbar is imperative; use sonner${messageHint} and place <Toaster /> in your layout`);

  if (childJsxElements(node).length > 0) {
    const open = openingElementRange(node);
    const close = closingElementRange(node);
    const edits: ContainerEdit[] = [{ start: open.start, end: open.end, replacement: "" }];
    if (close) edits.push({ start: close.start, end: close.end, replacement: "" });
    return edits;
  }
  return [{ start: node.getStart(), end: node.getEnd(), replacement: "<></>" }];
}

export function tabContextContainer(context: ContainerContext): ContainerEdit[] {
  const { element, node, indent, fullText } = context;
  context.registerImport({
    names: ["Tabs", "TabsContent", "TabsList", "TabsTrigger"],
    moduleSpecifier: "@/components/ui/tabs",
  });

  let onValueChange: string | undefined;
  for (const descendant of descendantJsxElements(node)) {
    if (context.localToCanonical.get(getTagName(descendant)) === "TabList") {
      const listElement = parseElement(descendant, fullText);
      const onChange = attribute(listElement, "onChange");
      if (onChange) onValueChange = renderAttributeValue(onChange.value);
      break;
    }
  }
  if (onValueChange) {
    context.warn("TabList onChange -> Tabs onValueChange; the handler now receives the value instead of an event");
  }

  const rootAttributes = renderRootAttributes(element, { context, drop: new Set([]) });
  const onValueChangeText = onValueChange ? ` onValueChange=${onValueChange}` : "";
  const open = openingElementRange(node);
  const close = closingElementRange(node);
  const edits: ContainerEdit[] = [
    { start: open.start, end: open.end, replacement: `<Tabs${rootAttributes}${onValueChangeText}>` },
  ];
  if (close) edits.push({ start: close.start, end: close.end, replacement: "</Tabs>" });

  for (const descendant of descendantJsxElements(node)) {
    const canonical = context.localToCanonical.get(getTagName(descendant));
    if (canonical === "TabList") {
      const childOpen = openingElementRange(descendant);
      const childClose = closingElementRange(descendant);
      edits.push({ start: childOpen.start, end: childOpen.end, replacement: "<TabsList>" });
      if (childClose) edits.push({ start: childClose.start, end: childClose.end, replacement: "</TabsList>" });
      context.consume(descendant);
      context.markConverted("TabList");
    } else if (canonical === "Tab") {
      const tabElement = parseElement(descendant, fullText);
      const valueAttribute = attribute(tabElement, "value");
      const labelAttribute = attribute(tabElement, "label");
      const valueText = valueAttribute ? ` value=${renderAttributeValue(valueAttribute.value)}` : "";
      const labelText = labelAttribute
        ? valueAsChild(labelAttribute.value)
        : Node.isJsxElement(descendant)
          ? innerOf(descendant, fullText)
          : "";
      consumeSubtree(context, descendant);
      context.markConverted("Tab");
      edits.push({
        start: descendant.getStart(),
        end: descendant.getEnd(),
        replacement: `<TabsTrigger${valueText}>${labelText}</TabsTrigger>`,
      });
    } else if (canonical === "TabPanel") {
      const panelElement = parseElement(descendant, fullText);
      const valueAttribute = attribute(panelElement, "value");
      const valueText = valueAttribute ? ` value=${renderAttributeValue(valueAttribute.value)}` : "";
      const childOpen = openingElementRange(descendant);
      const childClose = closingElementRange(descendant);
      edits.push({ start: childOpen.start, end: childOpen.end, replacement: `<TabsContent${valueText}>` });
      if (childClose) edits.push({ start: childClose.start, end: childClose.end, replacement: "</TabsContent>" });
      context.consume(descendant);
      context.markConverted("TabPanel");
    }
  }
  return edits;
}

export function transitionContainer(label: string, animateHint: string): (context: ContainerContext) => ContainerEdit[] {
  return (context) => {
    context.warn(`${label} dropped; content is preserved. Recreate the animation via tw-animate-css (${animateHint}) and the "in" state with a condition/data-state`);
    const open = openingElementRange(context.node);
    const close = closingElementRange(context.node);
    if (!close) {
      return [{ start: context.node.getStart(), end: context.node.getEnd(), replacement: "" }];
    }
    return [
      { start: open.start, end: open.end, replacement: "" },
      { start: close.start, end: close.end, replacement: "" },
    ];
  };
}

export const ratingTransform: CompositeTransform = (context) => {
  context.registerImport({ names: ["Star"], moduleSpecifier: "lucide-react" });
  const element = context.element;
  const maxAttribute = attribute(element, "max");
  let count = 5;
  if (maxAttribute) {
    const raw =
      maxAttribute.value.kind === "expression"
        ? maxAttribute.value.expression.trim()
        : maxAttribute.value.kind === "string"
          ? maxAttribute.value.value
          : "";
    if (/^\d+$/.test(raw)) count = Math.min(Number.parseInt(raw, 10), 10);
  }
  context.warn("Rating: wire up the fill (value) and interaction (onChange/hover) manually");
  const stars = Array.from({ length: count }, () => `  <Star className="size-5" />`).join("\n");
  return `<div className="flex items-center gap-0.5">\n${stars}\n</div>`;
};

export const stepLabelTransform: CompositeTransform = (context) => {
  if (attribute(context.element, "optional")) {
    context.warn("StepLabel optional dropped; add the optional hint manually");
  }
  const inner = context.element.hasChildren ? context.element.innerText.trim() : "";
  return `<span className="text-sm font-medium">${inner}</span>`;
};

function controlElementOf(node: JsxElementLike): JsxElementLike | undefined {
  const opening = Node.isJsxElement(node) ? node.getOpeningElement() : node;
  for (const attr of opening.getAttributes()) {
    if (!Node.isJsxAttribute(attr) || attr.getNameNode().getText() !== "control") continue;
    const initializer = attr.getInitializer();
    if (initializer && Node.isJsxExpression(initializer)) {
      const expression = initializer.getExpression();
      if (expression && (Node.isJsxElement(expression) || Node.isJsxSelfClosingElement(expression))) {
        return expression;
      }
    }
  }
  return undefined;
}

function convertFormControlLabelControl(
  context: ContainerContext,
  controlNode: JsxElementLike,
  id: string | undefined,
  fclValue: ParsedAttribute | undefined,
): string {
  const canonical = context.localToCanonical.get(getTagName(controlNode));
  const controlElement = parseElement(controlNode, context.fullText);
  const idAttr = id ? ` id="${id}"` : "";

  if (canonical === "Checkbox" || canonical === "Switch") {
    const importPath = canonical === "Checkbox" ? "@/components/ui/checkbox" : "@/components/ui/switch";
    context.registerImport({ names: [canonical], moduleSpecifier: importPath });
    context.markConverted(canonical);
    const parts: string[] = [];
    for (const entry of controlElement.attributes) {
      if (entry.name === "color" || entry.name === "size") continue;
      if (entry.name === "onChange") {
        context.warn(`${canonical} onChange -> onCheckedChange; the handler now receives a boolean instead of an event`);
        parts.push(renderAttribute({ name: "onCheckedChange", value: entry.value }));
        continue;
      }
      parts.push(renderAttribute(entry));
    }
    const attrText = parts.length ? " " + parts.join(" ") : "";
    return `<${canonical}${idAttr}${attrText} />`;
  }

  if (canonical === "Radio") {
    context.registerImport({ names: ["RadioGroupItem"], moduleSpecifier: "@/components/ui/radio-group" });
    context.markConverted("Radio");
    const valueAttr = controlElement.attributes.find((entry) => entry.name === "value") ?? fclValue;
    const valueText = valueAttr ? ` value=${renderAttributeValue(valueAttr.value)}` : "";
    return `<RadioGroupItem${valueText}${idAttr} />`;
  }

  const parts = controlElement.attributes.map((entry) => renderAttribute(entry));
  const attrText = parts.length ? " " + parts.join(" ") : "";
  return `<${getTagName(controlNode)}${idAttr}${attrText} />`;
}

export function formControlLabelContainer(context: ContainerContext): ContainerEdit[] {
  const { node, element, indent } = context;
  context.registerImport({ names: ["Label"], moduleSpecifier: "@/components/ui/label" });
  const labelAttr = attribute(element, "label");
  const valueAttr = attribute(element, "value");
  const labelStr = labelAttr && labelAttr.value.kind === "string" ? labelAttr.value.value : undefined;
  const valueStr = valueAttr && valueAttr.value.kind === "string" ? valueAttr.value.value : undefined;
  const id = valueStr ? slug(valueStr) : labelStr ? slug(labelStr) : undefined;

  const controlNode = controlElementOf(node);
  let controlJsx = "{/* control */}";
  if (controlNode) {
    controlJsx = convertFormControlLabelControl(context, controlNode, id, valueAttr);
  } else {
    context.warn("FormControlLabel control is not a static element; rebuild the control manually");
  }
  if (!id) {
    context.warn("FormControlLabel without a static value/label; link the control and Label via id/htmlFor manually");
  }

  const labelChild = labelAttr ? valueAsChild(labelAttr.value) : "";
  const htmlFor = id ? ` htmlFor="${id}"` : "";
  const replacement = [
    `<div className="flex items-center gap-2">`,
    `${indent}  ${controlJsx}`,
    `${indent}  <Label${htmlFor}>${labelChild}</Label>`,
    `${indent}</div>`,
  ].join("\n");
  consumeSubtree(context, node);
  return [{ start: node.getStart(), end: node.getEnd(), replacement }];
}

const TIMELINE_TAGS: Record<string, { tag: string; className: string }> = {
  TimelineItem: { tag: "li", className: "flex gap-4" },
  TimelineSeparator: { tag: "div", className: "flex flex-col items-center" },
  TimelineDot: { tag: "span", className: "size-3 rounded-full bg-primary" },
  TimelineConnector: { tag: "span", className: "w-px grow bg-border" },
  TimelineContent: { tag: "div", className: "flex-1 pb-4" },
  TimelineOppositeContent: { tag: "div", className: "flex-1 text-right text-muted-foreground" },
};

export function timelineContainer(context: ContainerContext): ContainerEdit[] {
  const { node } = context;
  context.warn("Timeline converted to semantic markup (best-effort); review the layout and connectors");
  const open = openingElementRange(node);
  const close = closingElementRange(node);
  const edits: ContainerEdit[] = [{ start: open.start, end: open.end, replacement: `<ul className="flex flex-col">` }];
  if (close) edits.push({ start: close.start, end: close.end, replacement: "</ul>" });

  for (const descendant of descendantJsxElements(node)) {
    const canonical = context.localToCanonical.get(getTagName(descendant));
    const map = canonical ? TIMELINE_TAGS[canonical] : undefined;
    if (!map || !canonical) continue;
    const childOpen = openingElementRange(descendant);
    const childClose = closingElementRange(descendant);
    if (childClose) {
      edits.push({ start: childOpen.start, end: childOpen.end, replacement: `<${map.tag} className="${map.className}">` });
      edits.push({ start: childClose.start, end: childClose.end, replacement: `</${map.tag}>` });
    } else {
      edits.push({ start: descendant.getStart(), end: descendant.getEnd(), replacement: `<${map.tag} className="${map.className}" />` });
    }
    context.consume(descendant);
    context.markConverted(canonical);
  }
  return edits;
}

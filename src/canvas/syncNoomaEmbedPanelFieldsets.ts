/** Tag Excalidraw .panelColumn fieldsets so only Layers + Actions stay visible for Nooma embeds. */
export function syncNoomaEmbedPanelFieldsets(
  host: HTMLElement | null,
  active: boolean
): void {
  const panel = host?.querySelector(
    ".excalidraw section.selected-shape-actions .panelColumn"
  );
  if (!panel) return;

  const fieldsets = panel.querySelectorAll("fieldset");
  fieldsets.forEach((fieldset) => {
    fieldset.classList.remove("nooma-panel-fieldset-show");
  });

  if (!active) return;

  const list = [...fieldsets];
  const layers = list.find((fieldset) => isLayersFieldset(fieldset));
  const actions = list.find((fieldset) => isActionsFieldset(fieldset)) ?? list.at(-1);

  layers?.classList.add("nooma-panel-fieldset-show");
  if (actions && actions !== layers) {
    actions.classList.add("nooma-panel-fieldset-show");
  }
}

function isLayersFieldset(fieldset: HTMLFieldSetElement): boolean {
  if (fieldset.querySelector(".zIndexButton")) return true;
  const legend = fieldset.querySelector("legend")?.textContent?.trim() ?? "";
  return /\blayers\b/i.test(legend);
}

function isStyleFieldset(fieldset: HTMLFieldSetElement): boolean {
  return (
    fieldset.querySelector('input[name="strokeStyle"]') !== null ||
    fieldset.querySelector('input[name="sloppiness"]') !== null ||
    fieldset.querySelector('input[name="edges"]') !== null ||
    fieldset.querySelector('[data-testid="strokeWidth-thin"]') !== null ||
    fieldset.querySelector('[data-testid="align-left"]') !== null ||
    fieldset.querySelector('[data-testid="opacity"]') !== null
  );
}

function isActionsFieldset(fieldset: HTMLFieldSetElement): boolean {
  const legend = fieldset.querySelector("legend")?.textContent?.trim() ?? "";
  if (/\bactions\b/i.test(legend)) return true;
  return (
    fieldset.querySelector(".buttonList") !== null && !isStyleFieldset(fieldset)
  );
}

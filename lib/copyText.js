// A page that embeds the calculator can block the clipboard API, as the webinar
// deck's iframe does. The older selection copy still works there.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return selectionCopy(text);
  }
}

function selectionCopy(text) {
  const focused = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.opacity = "0";
  document.body.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    focused?.focus({ preventScroll: true });
  }
}

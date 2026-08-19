/* Positions .tooltip-box popovers as position:fixed, computed from their
 * .tooltip-icon's on-screen location. The CSS alone (position:absolute)
 * got clipped whenever a tooltip sat inside one of the editor's scrolling
 * side panels, since a scrollable ancestor clips any absolutely-positioned
 * child that extends past its own edge. Fixed positioning is relative to
 * the viewport instead, so it isn't affected by any ancestor's overflow.
 *
 * Delegated on document so this also covers tooltip-wraps created later by
 * innerHTML (axis cards, dataset cards, etc.) without re-wiring anything. */

const Tooltips = (() => {
  const MARGIN = 8; // minimum gap kept from the viewport edge, in px

  function findIcon(target) {
    return target.closest ? target.closest(".tooltip-icon") : null;
  }

  function show(icon) {
    const box = icon.nextElementSibling;
    if (!box || !box.classList.contains("tooltip-box")) return;

    // Reset any previous placement so offsetWidth/Height below measure the
    // box's natural size, not a size left over from the last placement.
    box.classList.remove("arrow-down", "arrow-up");
    box.classList.add("visible");

    const iconRect = icon.getBoundingClientRect();
    const boxWidth = box.offsetWidth;
    const boxHeight = box.offsetHeight;

    let left = iconRect.left;
    if (left + boxWidth > window.innerWidth - MARGIN) {
      left = window.innerWidth - boxWidth - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;

    let top = iconRect.top - boxHeight - 6; // default: above the icon
    let arrowClass = "arrow-down"; // arrow points down, at the box's bottom, toward the icon below it
    if (top < MARGIN) {
      // not enough room above (e.g. the icon is near the top of the
      // viewport) — flip to showing the box below the icon instead
      top = iconRect.bottom + 6;
      arrowClass = "arrow-up";
    }

    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.classList.add(arrowClass);
  }

  function hide(icon) {
    const box = icon.nextElementSibling;
    if (!box || !box.classList.contains("tooltip-box")) return;
    box.classList.remove("visible");
  }

  function init() {
    document.addEventListener("mouseover", (e) => {
      const icon = findIcon(e.target);
      if (icon) show(icon);
    });
    document.addEventListener("mouseout", (e) => {
      const icon = findIcon(e.target);
      if (icon) hide(icon);
    });
    document.addEventListener("focusin", (e) => {
      const icon = findIcon(e.target);
      if (icon) show(icon);
    });
    document.addEventListener("focusout", (e) => {
      const icon = findIcon(e.target);
      if (icon) hide(icon);
    });
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", Tooltips.init);

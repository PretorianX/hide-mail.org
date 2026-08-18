/**
 * Collects the CSS rules styled-components generated for an element, so tests can
 * assert on layout mechanisms (stretched overlays, aspect ratios) that jsdom does
 * not resolve through getComputedStyle.
 */
export const cssRulesFor = (element) => {
  const selectors = element.className
    .split(' ')
    .filter(Boolean)
    .map((className) => new RegExp(`^\\.${className}(?![\\w-])`));

  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .filter((cssText) => selectors.some((selector) => selector.test(cssText)));
};

export const cssTextFor = (element) => cssRulesFor(element).join(' ');

// Home is the sole Tailwind entry. Prefix compiled selectors as a second
// boundary in addition to conditional WordPress enqueueing. No Preflight.
module.exports = {
  postcssPlugin: 'byline-home-scope',
  OnceExit(root) {
    root.walkRules((rule) => {
      let parent = rule.parent;
      while (parent) {
        if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
        parent = parent.parent;
      }
      rule.selectors = rule.selectors.map((selector) => {
        if (selector.includes('.byline-home-root')) return selector;
        if (selector === ':root' || selector === ':host') return '.byline-home-root';
        return `.byline-home-root ${selector}`;
      });
    });
    // wp-admin's unlayered form rules would otherwise outrank every Tailwind
    // utility regardless of specificity. Preserve Mira's actual utility styles
    // rather than rebuilding its controls with high-specificity overrides.
    root.walkAtRules('layer', (rule) => {
      if (rule.params === 'utilities' && rule.nodes) rule.replaceWith(rule.nodes);
    });
    root.walkAtRules(/keyframes$/, (rule) => { rule.params = `byline-home-${rule.params}`; });
    root.walkDecls((declaration) => {
      if (/animation|^--animate-/.test(declaration.prop)) declaration.value = declaration.value.replace(/\bpulse\b/g, 'byline-home-pulse');
    });
  },
};

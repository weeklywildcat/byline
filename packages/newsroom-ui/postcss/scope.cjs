// The shared admin UI is consumed by scoped newsroom surfaces and small isolated
// admin islands such as Settings navigation. Prefix compiled selectors as a
// second boundary in addition to conditional WordPress enqueueing. No Preflight.
const ROOT = '.byline-ui-root';

module.exports = {
  postcssPlugin: 'byline-ui-scope',
  OnceExit(root) {
    root.walkRules((rule) => {
      let parent = rule.parent;
      while (parent) {
        if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
        parent = parent.parent;
      }
      rule.selectors = rule.selectors.map((selector) => {
        if (selector.includes(ROOT)) return selector;
        if (selector === ':root' || selector === ':host') return ROOT;
        return `${ROOT} ${selector}`;
      });
    });
    // wp-admin's unlayered form rules would otherwise outrank every Tailwind
    // utility regardless of specificity. Utilities leave their cascade layer so
    // Nova's actual utility styles win inside the root without per-control overrides.
    root.walkAtRules('layer', (rule) => {
      if (rule.params === 'utilities' && rule.nodes) rule.replaceWith(rule.nodes);
    });
    // Keyframe names are global. Namespace every one (Tailwind's pulse, tw-animate-css's
    // enter/exit, …) and every animation that references it.
    const names = new Set();
    root.walkAtRules(/keyframes$/, (rule) => { names.add(rule.params); rule.params = `byline-ui-${rule.params}`; });
    if (names.size) {
      const pattern = new RegExp(`(^|[\\s,:(])(${[...names].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`, 'g');
      root.walkDecls((declaration) => {
        if (/^(animation(-name)?|--animate-.*|--tw-animation-name)$/.test(declaration.prop)) declaration.value = declaration.value.replace(pattern, '$1byline-ui-$2');
      });
    }
  },
};

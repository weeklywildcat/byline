// Story stylesheets are imported as strings and printed only on their own story.
declare module "*.css?inline" {
  const css: string;
  export default css;
}

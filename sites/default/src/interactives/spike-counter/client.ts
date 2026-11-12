export default function start(root: HTMLElement) {
  let count = 0;
  root.addEventListener("click", () => { root.textContent = `Default Site counter: ${++count}`; });
}

// Preloaded (node --import) into the add-player script under test: serves canned Hockey-Reference / HockeyDB pages.
// STUB_PAGES = {url: {status?, body?, url?}}; anything else is a 404.
const pages = JSON.parse(process.env.STUB_PAGES ?? "{}");
globalThis.fetch = async (url) => {
  const p = pages[url];
  if (!p) return new Response("", { status: 404 });
  const res = new Response(p.body ?? "", { status: p.status ?? 200 });
  if (p.url) Object.defineProperty(res, "url", { value: p.url });
  return res;
};

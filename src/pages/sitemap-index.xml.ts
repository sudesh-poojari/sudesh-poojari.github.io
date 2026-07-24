import { site } from "@/lib/site";
import { byPublishedDate } from "@/lib/writing";
import { getCollection } from "astro:content";

function url(path: string) {
  return new URL(path, site.url).toString();
}

export async function GET() {
  const articles = await getCollection("articles", ({ data }) => !data.draft);
  const pages = ["/", "/articles/", "/proficiencies/", "/about/", "/contact/"];
  const articlePages = articles.sort(byPublishedDate).map((article) => `/articles/${article.slug}/`);
  const entries = [...pages, ...articlePages]
    .map((path) => `<url><loc>${url(path)}</loc></url>`)
    .join("");

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`, {
    headers: {
      "Content-Type": "application/xml"
    }
  });
}

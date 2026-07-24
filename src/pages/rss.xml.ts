import rss from "@astrojs/rss";
import { site } from "@/lib/site";
import { byPublishedDate } from "@/lib/writing";
import { getCollection } from "astro:content";

export async function GET(context: { site: URL }) {
  const articles = await getCollection("articles", ({ data }) => !data.draft);
  const items = articles.sort(byPublishedDate);

  return rss({
    title: site.title,
    description: site.description,
    site: context.site,
    items: items.map((item) => ({
      title: item.data.title,
      description: item.data.description,
      pubDate: item.data.publishedAt,
      link: `/${item.collection}/${item.slug}/`
    }))
  });
}

import type { CollectionEntry } from "astro:content";

type WritingEntry = CollectionEntry<"articles">;

export function byPublishedDate(a: WritingEntry, b: WritingEntry) {
  return b.data.publishedAt.getTime() - a.data.publishedAt.getTime();
}

export function isPublished(entry: WritingEntry) {
  return !entry.data.draft;
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export function readingTime(body: string) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

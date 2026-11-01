export function flattenPublicDocLinks(text: string) {
  return text.replace(/\]\(docs\/public\/[a-z]+\/([\w.-]+\.md)\)/g, "](docs/$1)");
}

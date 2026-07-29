import DOMPurify from "dompurify";

/** 净化正文 HTML，防 XSS（移除 script/iframe/事件处理器等） */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li",
      "blockquote", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6",
      "img", "hr", "span", "div", "table", "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel"],
  });
}

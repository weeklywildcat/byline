import { RichText, useBlockProps } from "@wordpress/block-editor";
import type { TimelineItem } from "./items";

export function TimelineSave({ attributes }: { attributes: { items: TimelineItem[] } }) {
  return <ol {...useBlockProps.save({ className: "byline-timeline" })}>
    {attributes.items.map((item, index) => <li className="byline-timeline-item" key={index}>
      {item.label && <p className="byline-timeline-label">{item.label}</p>}
      {item.title.trim() && <h3 className="byline-timeline-title">{item.title}</h3>}
      {item.body && <RichText.Content tagName="p" className="byline-timeline-body" value={item.body} />}
    </li>)}
  </ol>;
}

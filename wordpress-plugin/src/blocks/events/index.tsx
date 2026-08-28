import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import { PanelBody, RangeControl, SelectControl, TextControl, ToggleControl } from "@wordpress/components";
import { registerBlockType } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { useMemo } from "@wordpress/element";

import metadata from "./block.json";
import { boundedNumber, ErrorNotice, PreviewFrame, queryPath, useBylineApi, type PreviewEvent } from "../newsroom/common";
import "./style.css";

function EventItem({ event }: { event: PreviewEvent }) {
  return (
    <li className="byline-event">
      <div className="byline-event-date">
        <time dateTime={event.startDate}>{event.display?.date || event.startDate || __("Date pending", "weekly-wildcat-headless")}</time>
        {event.display?.time ? <span>{event.display.time}</span> : null}
      </div>
      <div className="byline-event-content">
        <h3 className="byline-event-title">{event.externalUrl ? <a href={event.externalUrl}>{event.title}</a> : event.title}</h3>
        {event.eventType ? <p className="byline-event-type">{event.eventType}</p> : null}
        {event.location ? <p className="byline-event-location">{event.location}</p> : null}
      </div>
    </li>
  );
}

function EventsEdit({ attributes, setAttributes }: any) {
  const events = useBylineApi<PreviewEvent[]>(queryPath("/byline/v1/events", { per_page: 12 }));
  const blockProps = useBlockProps({ className: "byline-newsroom-block-editor" });
  const eventTypes = useMemo(() => Array.from(new Set((events.data || []).map((event) => event.eventType).filter((eventType): eventType is string => Boolean(eventType)))).sort(), [events.data]);
  const visibleEvents = (events.data || [])
    .filter((event) => !attributes.eventType || event.eventType === attributes.eventType)
    .slice(0, boundedNumber(attributes.limit, 5, 1, 12));
  const empty = !events.isLoading && visibleEvents.length === 0 ? __("No upcoming events match these settings.", "weekly-wildcat-headless") : "";

  return (
    <>
      <InspectorControls>
        <PanelBody title={__("Events", "weekly-wildcat-headless")} initialOpen>
          <TextControl __nextHasNoMarginBottom label={__("Heading", "weekly-wildcat-headless")} value={attributes.heading || ""} onChange={(heading: string) => setAttributes({ heading })} />
          <RangeControl __nextHasNoMarginBottom label={__("Event count", "weekly-wildcat-headless")} value={boundedNumber(attributes.limit, 5, 1, 12)} min={1} max={12} onChange={(limit) => setAttributes({ limit: boundedNumber(limit, 5, 1, 12) })} />
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Event type", "weekly-wildcat-headless")}
            help={__("Uses the event type already stored on canonical events.", "weekly-wildcat-headless")}
            value={attributes.eventType || ""}
            options={[{ label: __("All event types", "weekly-wildcat-headless"), value: "" }, ...eventTypes.map((eventType) => ({ label: eventType, value: eventType }))]}
            onChange={(eventType: string) => setAttributes({ eventType })}
          />
          <ToggleControl __nextHasNoMarginBottom label={__("Hide when empty", "weekly-wildcat-headless")} checked={Boolean(attributes.hideWhenEmpty)} onChange={(hideWhenEmpty) => setAttributes({ hideWhenEmpty })} />
        </PanelBody>
      </InspectorControls>

      <section {...blockProps}>
        {events.error ? <ErrorNotice message={events.error} /> : null}
        <PreviewFrame label={__("Events preview", "weekly-wildcat-headless")} isLoading={events.isLoading} empty={empty}>
          <div className="byline-events">
            <h2>{attributes.heading || __("Events", "weekly-wildcat-headless")}</h2>
            <ul className="byline-event-list">{visibleEvents.map((event) => <EventItem key={event.id} event={event} />)}</ul>
          </div>
        </PreviewFrame>
      </section>
    </>
  );
}

registerBlockType(metadata as any, { edit: EventsEdit, save: () => null });

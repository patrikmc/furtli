import type { EventTypeValue } from "db/schema";

/** One collection date as shown in an email. */
export interface EmailItem {
  type: EventTypeValue;
  /** YYYY-MM-DD */
  date: string;
  stationId?: string | null;
  stationName?: string | null;
  address?: string | null;
  /** e.g. "15–19 Uhr" for a Mobile Recyclinghof. */
  time?: string | null;
}

/** One thing a subscriber follows: a postcode or a station, with its collection types. */
export interface SummaryTarget {
  plz: string | null;
  stationName: string | null;
  topics: EventTypeValue[];
  /** In confirm emails/pages: what this confirmation adds or changes. */
  change?: "new" | "changed" | null;
}

/** The subscriber's whole subscription, shown in every email ("why you get this"). */
export interface SubscriptionSummary {
  targets: SummaryTarget[];
  reminders: boolean;
  digest: boolean;
}

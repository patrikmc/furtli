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

/** What the subscriber chose, for the summary in confirm/welcome emails. */
export interface SubscriptionSummary {
  plz: string | null;
  stationName: string | null;
  topics: EventTypeValue[];
  reminders: boolean;
  digest: boolean;
}

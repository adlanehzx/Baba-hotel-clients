/** Points proposés au client dans son avis (« ce qui vous a plu » / « à améliorer ») ; libellés dans les traductions. */
export const FEEDBACK_TAGS = ["clean", "welcome", "bed", "quiet", "breakfast", "location", "value", "wifi"] as const;
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];

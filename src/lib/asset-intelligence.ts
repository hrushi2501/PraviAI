/** Future advisory boundary. It must never decide safety, permissions or approvals. */
export interface AssetInsight {
  assetId: string;
  severity: "information" | "review_required" | "urgent_review";
  recommendation: string;
  reasoning: string;
  evidenceIds: string[];
  limitations: string[];
}
export interface AssetInsightProvider {
  suggest(input: {
    assetId: string;
    authorisedEvidenceIds: string[];
  }): Promise<AssetInsight[]>;
}

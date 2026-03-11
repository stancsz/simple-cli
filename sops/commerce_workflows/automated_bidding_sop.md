# Automated Bidding SOP

## Purpose
This SOP details the process for the autonomous agent to evaluate marketplace opportunities (e.g., Upwork, Fiverr, TopTal) and submit competitive proposals on behalf of the agency.

## Pre-requisites
- `automated_bidding` tool available
- `EpisodicMemory` accessible and populated with past successful project delivery patterns
- Marketplaces authenticated or scraped based on available data

## Steps

1. **Identify Opportunities**
   - Continuously monitor predefined external marketplaces using the `automated_bidding` tool or external scrapers.
   - Filter opportunities based on parameters: `marketplace`, `budget` (minimum), and matching `opportunity_description`.

2. **Evaluate Fit**
   - Execute the `automated_bidding` tool by passing the `marketplace`, `opportunity_description`, and `budget`.
   - The tool will check the `match_score`.
   - **Decision Gate**: If the `match_score` is below the configured threshold (e.g., 0.75), discard the opportunity and move to the next.

3. **Draft Proposal**
   - If the opportunity passes the decision gate, review the generated `proposal_text`.
   - The proposal should heavily incorporate proof-points from past successful bids stored in the `EpisodicMemory`.
   - Verify the `bid_amount` is competitive and meets the minimum required margin (usually calculated or validated against agency `corporate_policy`).

4. **Submit Bid**
   - Submit the proposal via the marketplace API or automated web-interaction (via Stagehand/BrowserBase if needed).
   - Log the submission into the CRM as a 'Submitted Proposal'.

5. **Track Success**
   - Log any feedback or status changes of the bid in `EpisodicMemory` for future learning.
   - Update `revenue_forecasting` with the newly potential pipeline value if the bid moves to an interview stage.

## Success Criteria
- Bid accurately reflects agency capability (high match score).
- Minimum ROI / margin constraints are upheld.
- Successfully records the outcome in `EpisodicMemory` for iterative improvement.

# Reconstruction evidence

All nine metadata files and all 1,000 HTML snapshots were analyzed. Run `python3 scripts/analyze-recording.py` to reproduce `recording-audit.json`, including input checksums, source snapshots for each question, event selectors, API counts, capture phases, large diffs, and question/language transitions.

- `manifest.json`: original host and resource-capture policy; capture stopped at the 1,000-snapshot limit. Extension/dictionary DOM is excluded from the reconstruction.
- `routes.json` + `visits.json`: login → confirmation → assessment → submission; `/submit` has no captured DOM.
- `snapshots.json`: 997 settled captures and 3 route-entry captures; all ten question bodies, login and confirmation HTML, footer classes, 550px Monaco editor, language selector, and watermark.
- `events.json`: 259 clicks, 11 input events, 11 change events, and one login submission. Select changes and question transitions confirm that the language selection stays selected across questions.
- `network.json`: ten recorded endpoints; 98 answer requests, 24 upload-URL requests, 12 recording-complete requests. Submission happens before recording-seal; the final upload-URL, recording-complete and recording-finalize requests happen on `/submit`.
- `snapshot-diffs.json`: UI changes were reviewed alongside stable captures to distinguish transitions and Monaco suggestions from complete page states.
- `snapshotMetrics.json`: 883 records are marked limited, which explains why later actions do not have complete DOM captures.
- `timeline.json`: links snapshots to visits/events/requests; temporal correlation is not treated as proof of exact business logic.

The CSS and editor helpers referenced by the snapshots were available on the original host. Original question/editor styles are retained in `src/recorded.css`; the Java, HTML/Bootstrap, CSS and JavaScript completion helpers and reference groups are retained in `src/recorded-snippets.js` and `src/snippet-guide.json`. No original application or backend bundle is executed.

The submission screen is reconstructed rather than claimed as an exact captured screen. Fullscreen enforcement and the combined two-attempt clipboard policy follow the user's explicit requirements. No extra keyboard violation types (developer tools, screenshots, tab switching) are counted toward this clipboard rule.

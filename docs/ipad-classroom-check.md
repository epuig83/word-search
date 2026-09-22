# Physical iPad classroom check

Status: **Pending — no physical iPad was available during implementation.**

The automated `ipad-webkit` project covers touch taps, portrait/landscape viewports, hints, recovery and the printable-versions dialog in Catalan, Spanish and English. A real-device pass is still needed for native Safari behaviour, finger dragging, the on-screen keyboard, offline storage and system printing.

## Record before testing

- Date, iPad model, iPadOS and Safari version:
- Tested app URL and release/commit:
- Browser tab or installed home-screen app:
- Result: pending / passed / issue found

Use a disposable activity so existing classroom work is not replaced. Allow about 5–10 minutes. No pupil names or real results are needed.

## Classroom walkthrough

1. Open the app in Safari with a connection. Wait for **Ready to use offline** in the teacher panel.
2. Enter a short topic and 4–6 words with the on-screen keyboard. Check that fields and creation controls remain reachable while the keyboard is open, and create the activity.
3. Open the pupil area. Find one word with first/last-letter taps and another by dragging a finger. Scroll outside the board and check the bottom row is reachable without accidental selections.
4. Rotate the iPad both ways. Verify the full grid, word list and hint controls remain usable; use both stages of a hint.
5. Reload and continue. Verify the same letters, found words and used hints return. Try **New pupil** and verify the board stays the same while progress resets.
6. Return to the teacher panel with the local PIN (default `1234` unless changed). Prepare four versions. Check A matches the original and that the dialog's options and buttons remain reachable in both orientations.
7. Open **Print / PDF**. Check eight pages: worksheets A–D followed by matching answer keys A–D. Check labels, last rows, word lists and solution markings. Cancel once, reopen and confirm the same models; save a PDF if possible. AirPrint on paper is optional if no printer is available.
8. While the app reports offline readiness, enable airplane mode, close Safari's app tabs, reopen the app URL and continue the activity. Prepare another batch without a connection. Check that the indicator describes offline readiness correctly.
9. Restore the connection. If an update is available, leave the activity open and verify it is not interrupted. After class, close every app tab/window and reopen to apply it. Mark this step **not exercised** if no update is available.

For an issue, record the numbered step, expected behaviour, observed behaviour and whether it repeats. A screenshot without pupil information is useful. Do not mark the physical check passed based on automated WebKit results.

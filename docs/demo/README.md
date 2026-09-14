# Demo guide

The repository includes a silent, captioned walkthrough and three primary screenshots. The generated video is intentionally short and works without audio.

## Files

- `poker-ledger-demo.mp4` — portfolio walkthrough
- `cover.png` — README thumbnail linked to the video
- `live-table.png` — shared game state and private cards
- `mobile-lobby.png` — phone-sized QR lobby
- `ledger.png` — standings, suggested payments and history

## Recreate the data

Run `npm run demo:seed` against a development Supabase project. This creates a dedicated account with fictional data and stores its credentials in `.env.demo.local.json`, which Git ignores.

Run the production app on port 3100, sign into the host account and use a second browser profile or local hostname for the guest. Re-run the seed to reset only this demo account's recorded fixtures.

## Suggested narrated recording

If you record a live version with QuickTime, aim for 60–90 seconds:

1. “Poker Ledger replaces the spreadsheet used to run home poker games and settle balances.”
2. Create or open a lobby and point out the QR code.
3. Join as a guest in another browser and approve the request from the host view.
4. Start the game, deal digital cards and make one player action. Show the update in both sessions.
5. Explain that betting rules and card access are enforced in PostgreSQL functions.
6. Finish a hand, close the game and show the Account Sheet.
7. End on the stack and test coverage, with the repository link visible.

Do not show the demo credential file, environment variables, browser developer tools containing tokens, or personal notifications.

## Rebuild the packaged video

The optional generator requires Pillow and `imageio-ffmpeg`:

```bash
python -m pip install -r requirements-demo.txt
python scripts/build-demo-video.py
```

QuickTime and iMovie remain the recommended free tools for a narrated version.

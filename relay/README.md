# Aster relay

A personal relay that lets a phone reach an Aster host when neither side accepts inbound
connections, so the phone works while your computer is off. Each user deploys their own copy to the Cloudflare Workers Free plan, so no
shared relay exists and nobody is billed: without a payment method, going over the free daily
limits makes the relay refuse requests until 00:00 UTC instead of charging.

The relay forwards end-to-end encrypted frames and never sees plaintext. `/ws` refuses any request
whose `key` query parameter does not match the `RELAY_KEY` secret.

## Deploy

Create a free Cloudflare account without adding a payment method. Then either choose **Open setup
in a terminal** in Aster's Research → Home → Phone dialog, which runs `node scripts/setup.mjs` to do
the steps below (safe to run again), or run them yourself from `relay/`:

```sh
npm install
npx wrangler login
npm run deploy                       # prints https://aster-relay.<subdomain>.workers.dev
mkdir -p ~/.config/aster-relay
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" > ~/.config/aster-relay/relay-key
chmod 600 ~/.config/aster-relay/relay-key
npx wrangler secret put RELAY_KEY < ~/.config/aster-relay/relay-key
curl https://aster-relay.<subdomain>.workers.dev/health   # {"status":"ok"}
echo "wss://aster-relay.<subdomain>.workers.dev/ws?key=$(cat ~/.config/aster-relay/relay-key)"
```

The last line is your relay URL. Keep it private: the key is what keeps others off your free quota.

## Use

- **SSH host:** in Aster, open Research → Home → Phone (it fills in the URL saved in
  `~/.config/aster-relay/relay-url`, or paste it once), then choose Turn on and Phone QR for the
  server. The server keeps the setting and rejoins after restarts. Each server row lists the phones
  it paired; revoke any you no longer use or whose QR or link leaked. A link stays valid after a
  phone opens it, until you revoke it. Revoking does not change the relay key that every paired
  phone holds: if you no longer trust a revoked phone, delete `~/.config/aster-relay/relay-key`,
  run the setup again, clear the Phone dialog's relay field and reopen the dialog so it fills in
  the new URL, turn each server off and on, and pair your phones again.
- **Headless host:** `aster serve --relay '<relay URL>'` prints the same QR in the terminal. The
  URL is visible to other users of the host in its process list; on a shared host, turn phone
  access on from the Phone dialog instead, which keeps the URL in a private file.
- **Phone:** scan the QR with the camera and open it in Safari. To keep Aster on the Home Screen,
  tap Share → Add to Home Screen, open it there, and paste the copied link once.

The phone loads the web client from the Aster site and talks to the host through your relay. Idle
connections hibernate and keepalive pings are free, so personal use stays within the free plan.

## Source

Based on the Cloudflare adapter in [Paseo](https://github.com/getpaseo/paseo)'s `packages/relay`
(Apache-2.0, see `LICENSE`). Changes: the cutover proxy to Paseo's upstream relay is removed, and
`/ws` requires `RELAY_KEY`.

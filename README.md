# Aashna Mam Messaging Simulator

A React, TypeScript, and Vite progressive web app with on-device IndexedDB storage. Contacts, chat messages, groups, communities, status media, and attachments remain in the browser’s database. The app does not connect to a messaging service or send content to phone numbers.

## Project layout

```text
local-messaging-simulator/
├── .github/workflows/deploy.yml
├── public/                 PWA manifest, icons, and service worker fallback
├── src/
│   ├── assets/             App icon source and chat wallpaper
│   ├── domain/             IndexedDB, backups, and media helpers
│   ├── App.tsx             Screens and interactions
│   ├── main.tsx            React and service worker entry
│   └── styles.css          Mobile-first interface and safe-area styles
├── scripts/                Offline cache generation
├── index.html
├── package.json
└── vite.config.ts
```

## Run on Windows

Install Node.js LTS, open this project folder in PowerShell, and run:

```powershell
npm ci
npm run dev -- --host 0.0.0.0
```

Vite prints a local address. Open it on the laptop. To check the layout from an iPhone on the same Wi-Fi, use the laptop’s IPv4 address and port shown by Vite, for example `http://192.168.1.20:5173`. This plain HTTP address is for preview; iPhone Home Screen installation and offline caching require HTTPS.

Create the production files with `npm run build`. They are written to `dist/`. `npm run preview` serves the production build locally.

## Contacts, chats, and media

- Use **+** to add a contact. Choose an optional picture from the device. Open a contact to chat; use its name or avatar to edit the saved name, phone number, and picture.
- Messages are sorted by their saved timestamps and grouped by the device’s local date. The composer **+** lets you add sent or received entries at a chosen time.
- The attachment menu supports documents, photos and videos, camera capture where available, audio, a location card, a contact card, and historical message entries. The green microphone control records a voice clip where the browser supports `MediaRecorder` and microphone permission is granted.
- Outgoing double checks are grey until an incoming entry is recorded after them, when they turn blue. Check colors are local display behavior and do not confirm real delivery or reading.
- In **Communities**, create groups with at least one selected member and an optional group picture, add groups to a community during creation or later, and open a group chat. Use the add-message control in a group header to enter a message from one of its members.
- In **Updates**, post a photo or video under your own status or a contact’s name. Statuses are removed after 24 hours, including while the app remains open, and can be viewed full screen.
- The **You** tab contains the app’s information, backup and restore actions, and the clear-data option.

## Backups and the starter file

Use **You → Export a backup** to download a JSON file containing saved contacts, messages, attachments, statuses that have not expired, groups, and communities. Keep that file private: it can contain phone numbers and media. Use **You → Import or restore a backup** on the device where it should be restored. Import replaces the records currently stored by this app in that browser.

The private starter backup `Aashna-Mam-local-starter.json` is stored outside this project’s public folder. Import it from **You** if you want the reference contacts and initial dated messages. The starter file is not included in the built site or the public GitHub Pages repository.

## Free GitHub Pages deployment

The production site is published at [prajjwalsingh628.github.io/local-message-simulator](https://prajjwalsingh628.github.io/local-message-simulator/). GitHub Pages serves only the static application files. Each person’s contacts and chat records stay in that person’s browser storage.

To publish a new source revision, push the project to the repository’s `main` branch and let the included **Build and publish** GitHub Actions workflow finish. The repository must have **Settings → Pages → GitHub Actions** selected. No paid plan or backend is needed.

## Install on iPhone

1. Open the HTTPS site in Safari.
2. Tap **Share → Add to Home Screen → Add**. Leave **Open as Web App** enabled if Safari offers it.
3. Open the new Home Screen app once while online so its application shell can be cached.
4. To confirm offline shell support, close it, enable Airplane Mode, and open it again. Previously saved IndexedDB content is available on that device; app updates require a connection.

The app asks for microphone or camera access only when you choose voice recording or camera capture. Media and messages are stored in that browser and are not synchronized to other devices.

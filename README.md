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

- Use the home **+** to add a contact. Choose a picture, crop it to a square, and see it as a circle. Contact information lets you update the name, number, and picture later.
- Messages are sorted by their saved timestamps and grouped by the device’s local date. The composer **+** has one action: **Add message with date & time**. Its form lets you choose Sent or Received and set the timestamp.
- The camera button beside the microphone opens the device camera or photo picker where supported. The green microphone control records a voice clip where the browser supports `MediaRecorder` and microphone permission is granted. Previously supported file/media entries remain readable from chat history.
- Outgoing double checks are grey until an incoming entry is recorded after them, when they turn blue. Check colors are local display behavior and do not confirm real delivery or reading.
- Groups appear in the **Chats** list, while **Communities** contains communities and their associated groups. Create or edit a group name, picture, and member list from the group chat header. Group messages support local sent and received text entries.
- The **Calls** tab keeps a local call log with contact, incoming/outgoing/missed type, date, duration, and audio/video designation. Use **+** to add an entry; this does not place a real call.
- In **Updates**, post a photo or video under your own status or a contact’s name. Statuses are removed after 24 hours, including while the app remains open, and can be viewed full screen.
- The **You** tab lets the user edit their profile name, photo, phone number, and About text. Photos can be square-cropped. Its iOS-style settings pages save switches and choices, including Dark, Light, and System appearance. App information, backup and restore, clear-data, and **Install app** options are also there. The install button uses the browser prompt on Android; on iPhone it explains Safari’s Share → Add to Home Screen flow, which Apple requires the user to confirm.

## Backups and the starter file

Use **You → Export a backup** to download a JSON file containing saved contacts, messages, attachments, statuses that have not expired, groups, communities, calls, and settings. Keep that file private: it can contain phone numbers and media. Use **You → Import or restore a backup** on the device where it should be restored. Import replaces the records currently stored by this app in that browser.

The private starter backup `Aashna-Mam-local-starter.json` is stored outside this project’s public folder. Import it from **You** if you want the reference contacts and initial dated messages. The starter file is not included in the built site or the public GitHub Pages repository.

## Free GitHub Pages deployment

The production site is published at [prajjwalsingh628.github.io/local-message-simulator](https://prajjwalsingh628.github.io/local-message-simulator/). GitHub Pages serves only the static application files. Each person’s contacts and chat records stay in that person’s browser storage.

To publish a new source revision, push the project to the repository’s `main` branch and let the included **Build and publish** GitHub Actions workflow finish. The repository is configured for **Settings → Pages → GitHub Actions** publishing. No paid plan or backend is needed.

Recent refinements add stable settings-page navigation, precise square contact-photo cropping, group chats and editing in **Chats**, community membership lists, a locally stored Calls history, and improved Light-theme control contrast.

## Install on iPhone

1. Open the HTTPS site in Safari.
2. Tap **Share → Add to Home Screen → Add**. Leave **Open as Web App** enabled if Safari offers it.
3. Open the new Home Screen app once while online so its application shell can be cached.
4. To confirm offline shell support, close it, enable Airplane Mode, and open it again. Previously saved IndexedDB content is available on that device; app updates require a connection.

The app asks for microphone or camera access only when you choose voice recording or camera capture. Media and messages are stored in that browser and are not synchronized to other devices.

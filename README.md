# Aashna Mam Messaging Simulator

A mobile-first React, TypeScript, and Vite app with an iOS-inspired chat list and conversations. Contacts and messages use IndexedDB in the current browser profile. Nothing is sent to phone numbers or a messaging service.

The simulator and privacy explanation is in the **You** tab. The home screen and chats keep a clean messaging layout. Outgoing bubbles always use two grey decorative checks; incoming messages are entered manually. Neither direction represents a delivered message.

## Project structure

~~~text
local-messaging-simulator/
├── .github/workflows/deploy.yml   # Free GitHub Pages deployment
├── public/                        # App icons, manifest, service worker fallback
├── src/
│   ├── assets/                    # Original icon source and chat wallpaper
│   ├── domain/                    # IndexedDB and backup validation
│   ├── App.tsx                    # Screens, contacts, and chat interactions
│   ├── main.tsx                   # React and service worker entry
│   └── styles.css                 # Responsive iOS-inspired interface
├── index.html
├── package.json
├── package-lock.json
├── scripts/generate-service-worker.mjs
└── vite.config.ts                 # Relative paths for static hosting
~~~

## Run on Windows

Install Node.js LTS from [nodejs.org](https://nodejs.org/). In PowerShell, open this folder and run:

~~~powershell
npm ci
npm run dev
~~~

Open the local address printed in the terminal, usually **http://localhost:5173**. Build the production site with:

~~~powershell
npm run build
~~~

The static site and generated offline service worker are written to **dist/**. Use **npm run preview** to view the production build locally.

## Add the starter contacts and history

The public app starts with an empty chat list. The private starter file is kept separate so contact details and message text are not published with the app.

1. Open **You → Import or restore a backup** on the device that will use the app.
2. Select **Aashna-Mam-local-starter.json** from Files.
3. The app restores seven contacts and the two complete messages shown in the reference: 8 October 2026 at 8:27 PM and 9 October 2026 at 8:19 PM (India local time).

The starter file is outside the project’s public folder and is not included in the production build or GitHub repository. Keep it private when transferring it to the iPhone. Existing version 1 JSON backups remain importable.

## Use the app

- The **Chats** list includes every saved contact. Contacts with messages sort by their latest message time; contacts without messages follow in their saved order. Search filters names.
- Tap **+** to add a contact. Open any row to chat. The contact’s avatar/name or information icon opens the contact page, where the name and phone number can be edited, copied, or deleted.
- Type a message and tap the green send control to save an outgoing message with the current time.
- Tap the composer **+** to add a message with a chosen date and time, or to enter a received message at the current or a selected earlier time. Choose **Sent** or **Received** in the form.
- Messages are grouped by the device’s local date. Long-press a message (or use its focused delete action) to delete it after confirmation.
- **Updates**, **Calls**, and **Communities** are visual tabs. **Chats** and **You** are the working tabs.
- The **You** tab explains the simulator, offers backup export/import, and can clear all app data from the current browser.

The app does not call, text, contact, or message any phone number. The two grey checks are decorative only. Backups contain names, phone numbers, and message text; keep backup files private. Moving to another device requires manual export and import and does not synchronize data.

## Free HTTPS deployment

The app is published on free GitHub Pages:

**https://prajjwalsingh628.github.io/local-message-simulator/**

To publish changes from a GitHub repository:

1. Upload the project source files to a GitHub repository; do not upload the sibling starter JSON or any exported backup.
2. Open **Settings → Pages** and select **GitHub Actions** as the publishing source.
3. Push to **main** and wait for the included **Build and publish** workflow to finish.
4. Open the HTTPS address under **Settings → Pages** or in the workflow summary.

The deployed files contain only the app shell and assets. User contacts and conversations remain in each device’s IndexedDB. No paid plan, server, custom domain, or database is needed.

## Install on iPhone

1. Open the HTTPS URL in Safari.
2. Tap **Share → Add to Home Screen → Add**. Leave **Open as Web App** enabled if Safari shows that option.
3. Launch the Home Screen app once while online so the service worker can cache its shell.
4. Use **You → Import or restore a backup** to load the starter file or a private backup.
5. To check offline shell support, close the app, enable Airplane Mode, and reopen it. The interface shell should load; new site updates need a connection.

The app requests no camera, microphone, or phone permissions. Its custom green chat-and-phone icon is bundled with the app. If an older install keeps its previous icon, export a backup, remove the Home Screen shortcut, then add the app again from Safari and restore the backup.

## Local network preview

For a quick preview from an iPhone on the same Wi-Fi:

1. Run **npm ci** once on Windows.
2. Start Vite with **npm run dev -- --host 0.0.0.0**.
3. Run **ipconfig** and note the laptop’s IPv4 address.
4. Open **http://LAPTOP-IP:5173** in iPhone Safari.

This is for layout checks. A plain local IP over HTTP is not a secure origin for service-worker installation; use the free HTTPS deployment for installation and offline use.

## Privacy

- No analytics, advertisements, trackers, messaging APIs, SMS, calls, remote database, or account sync are included.
- Only the static app shell is hosted. Contact data and message content are stored in IndexedDB on the device using the app.
- Import/export is a manual file operation. The simulator’s inbound messages are written by the user, not received from a network.

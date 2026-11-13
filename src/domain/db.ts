import type { AppPreference, AppProfile, BackupFile, Community, Contact, Group, GroupMessage, Message, StatusUpdate } from './types';

const DB_NAME = 'local-message-simulator';
const DB_VERSION = 3;
let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local database request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Local database update was cancelled.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Local database update failed.'));
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('contacts')) db.createObjectStore('contacts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('messages')) {
          const messages = db.createObjectStore('messages', { keyPath: 'id' });
          messages.createIndex('contactId', 'contactId', { unique: false });
        }
        if (!db.objectStoreNames.contains('groups')) db.createObjectStore('groups', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('communities')) db.createObjectStore('communities', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('groupMessages')) {
          const groupMessages = db.createObjectStore('groupMessages', { keyPath: 'id' });
          groupMessages.createIndex('groupId', 'groupId', { unique: false });
        }
        if (!db.objectStoreNames.contains('statuses')) {
          const statuses = db.createObjectStore('statuses', { keyPath: 'id' });
          statuses.createIndex('ownerId', 'ownerId', { unique: false });
          statuses.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('appProfile')) db.createObjectStore('appProfile', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
      request.onblocked = () => reject(new Error('Close another copy of the app, then try again.'));
    }).catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

export interface LocalData {
  contacts: Contact[];
  messages: Message[];
  groups: Group[];
  groupMessages: GroupMessage[];
  communities: Community[];
  statuses: StatusUpdate[];
  preferences: AppPreference[];
  appProfile?: AppProfile;
}

export async function readAllData(): Promise<LocalData> {
  const db = await openDatabase();
  const transaction = db.transaction(['contacts', 'messages', 'groups', 'groupMessages', 'communities', 'statuses', 'preferences', 'appProfile'], 'readonly');
  const done = transactionDone(transaction);
  const [contacts, messages, groups, groupMessages, communities, statuses, preferences, appProfileRecord] = await Promise.all([
    requestResult<Contact[]>(transaction.objectStore('contacts').getAll()),
    requestResult<Message[]>(transaction.objectStore('messages').getAll()),
    requestResult<Group[]>(transaction.objectStore('groups').getAll()),
    requestResult<GroupMessage[]>(transaction.objectStore('groupMessages').getAll()),
    requestResult<Community[]>(transaction.objectStore('communities').getAll()),
    requestResult<StatusUpdate[]>(transaction.objectStore('statuses').getAll()),
    requestResult<AppPreference[]>(transaction.objectStore('preferences').getAll()),
    requestResult<{ id: string; name: string; about: string; phoneNumber: string; photoDataUrl: string | null } | undefined>(transaction.objectStore('appProfile').get('me'))
  ]);
  await done;
  const now = Date.now();
  const activeStatuses = statuses.filter((status) => Date.parse(status.expiresAt) > now);
  const expiredStatuses = statuses.filter((status) => Date.parse(status.expiresAt) <= now);
  if (expiredStatuses.length) {
    const cleanup = db.transaction('statuses', 'readwrite');
    for (const status of expiredStatuses) cleanup.objectStore('statuses').delete(status.id);
    await transactionDone(cleanup);
  }
  return {
    contacts: contacts.sort((left, right) => left.order - right.order),
    messages: messages.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
    groups: groups.sort((left, right) => left.order - right.order),
    groupMessages: groupMessages.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
    communities: communities.sort((left, right) => left.order - right.order),
    statuses: activeStatuses.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
    preferences,
    ...(appProfileRecord ? { appProfile: { name: appProfileRecord.name, about: appProfileRecord.about, phoneNumber: appProfileRecord.phoneNumber, photoDataUrl: appProfileRecord.photoDataUrl } } : {})
  };
}

export async function savePreference(preference: AppPreference): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('preferences', 'readwrite');
  transaction.objectStore('preferences').put(preference);
  await transactionDone(transaction);
}

export async function saveAppProfile(profile: AppProfile): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('appProfile', 'readwrite');
  transaction.objectStore('appProfile').put({ id: 'me', ...profile });
  await transactionDone(transaction);
}

export async function saveContact(contact: Contact): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('contacts', 'readwrite');
  transaction.objectStore('contacts').put(contact);
  await transactionDone(transaction);
}

export async function saveMessage(message: Message): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('messages', 'readwrite');
  transaction.objectStore('messages').put(message);
  await transactionDone(transaction);
}

export async function saveGroup(group: Group): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('groups', 'readwrite');
  transaction.objectStore('groups').put(group);
  await transactionDone(transaction);
}

export async function saveGroupMessage(message: GroupMessage): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('groupMessages', 'readwrite');
  transaction.objectStore('groupMessages').put(message);
  await transactionDone(transaction);
}

export async function saveCommunity(community: Community): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('communities', 'readwrite');
  transaction.objectStore('communities').put(community);
  await transactionDone(transaction);
}

export async function saveStatus(status: StatusUpdate): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('statuses', 'readwrite');
  transaction.objectStore('statuses').put(status);
  await transactionDone(transaction);
}

export async function updateStatusViewed(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('statuses', 'readwrite');
  const store = transaction.objectStore('statuses');
  const request = store.get(id);
  request.onsuccess = () => { if (request.result) store.put({ ...request.result, viewed: true }); };
  await transactionDone(transaction);
}

export async function removeMessage(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('messages', 'readwrite');
  transaction.objectStore('messages').delete(id);
  await transactionDone(transaction);
}

export async function removeGroupMessage(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('groupMessages', 'readwrite');
  transaction.objectStore('groupMessages').delete(id);
  await transactionDone(transaction);
}

export async function removeStatus(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('statuses', 'readwrite');
  transaction.objectStore('statuses').delete(id);
  await transactionDone(transaction);
}

export async function removeContactAndMessages(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(['contacts', 'messages', 'statuses', 'groups', 'preferences'], 'readwrite');
  transaction.objectStore('contacts').delete(id);
  const messages = transaction.objectStore('messages');
  const messageCursor = messages.index('contactId').openKeyCursor(IDBKeyRange.only(id));
  messageCursor.onsuccess = () => {
    const cursor = messageCursor.result;
    if (cursor) { messages.delete(cursor.primaryKey); cursor.continue(); }
  };
  const statuses = transaction.objectStore('statuses');
  const statusCursor = statuses.index('ownerId').openKeyCursor(IDBKeyRange.only(id));
  statusCursor.onsuccess = () => {
    const cursor = statusCursor.result;
    if (cursor) { statuses.delete(cursor.primaryKey); cursor.continue(); }
  };
  const groups = transaction.objectStore('groups');
  const groupCursor = groups.openCursor();
  groupCursor.onsuccess = () => {
    const cursor = groupCursor.result;
    if (!cursor) return;
    const group = cursor.value as Group;
    if (group.memberIds.includes(id)) cursor.update({ ...group, memberIds: group.memberIds.filter((member) => member !== id) });
    cursor.continue();
  };
  const preferences = transaction.objectStore('preferences');
  const preferenceCursor = preferences.openCursor();
  preferenceCursor.onsuccess = () => {
    const cursor = preferenceCursor.result;
    if (!cursor) return;
    if (String(cursor.key).startsWith(`contact:${id}:`)) cursor.delete();
    cursor.continue();
  };
  await transactionDone(transaction);
}

export async function removeGroup(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(['groups', 'groupMessages', 'communities'], 'readwrite');
  transaction.objectStore('groups').delete(id);
  const groupMessages = transaction.objectStore('groupMessages');
  const request = groupMessages.index('groupId').openKeyCursor(IDBKeyRange.only(id));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) { groupMessages.delete(cursor.primaryKey); cursor.continue(); }
  };
  const communities = transaction.objectStore('communities');
  const communityRequest = communities.openCursor();
  communityRequest.onsuccess = () => {
    const cursor = communityRequest.result;
    if (!cursor) return;
    const community = cursor.value as Community;
    if (community.groupIds.includes(id)) cursor.update({ ...community, groupIds: community.groupIds.filter((groupId) => groupId !== id) });
    cursor.continue();
  };
  await transactionDone(transaction);
}

export async function replaceLocalData(backup: BackupFile): Promise<void> {
  const db = await openDatabase();
  const names = ['contacts', 'messages', 'groups', 'groupMessages', 'communities', 'statuses', 'preferences', 'appProfile'];
  const transaction = db.transaction(names, 'readwrite');
  for (const name of names) transaction.objectStore(name).clear();
  for (const contact of backup.contacts) transaction.objectStore('contacts').put(contact);
  for (const message of backup.messages) transaction.objectStore('messages').put(message);
  for (const group of backup.groups) transaction.objectStore('groups').put(group);
  for (const message of backup.groupMessages) transaction.objectStore('groupMessages').put(message);
  for (const community of backup.communities) transaction.objectStore('communities').put(community);
  for (const status of backup.statuses) transaction.objectStore('statuses').put(status);
  if (backup.appProfile) transaction.objectStore('appProfile').put({ id: 'me', ...backup.appProfile });
  for (const preference of backup.preferences ?? []) transaction.objectStore('preferences').put(preference);
  await transactionDone(transaction);
}

export async function clearLocalData(): Promise<void> {
  const db = await openDatabase();
  const names = ['contacts', 'messages', 'groups', 'groupMessages', 'communities', 'statuses', 'preferences', 'appProfile'];
  const transaction = db.transaction(names, 'readwrite');
  for (const name of names) transaction.objectStore(name).clear();
  await transactionDone(transaction);
}

export type Direction = 'outgoing' | 'incoming';

export interface Contact {
  id: string;
  name: string;
  countryCode: string;
  phoneNumber: string;
  avatarInfo: { kind: 'placeholder' };
  photoDataUrl?: string | null;
  createdAt: string;
  lastModifiedAt: string;
  order: number;
}

export interface MessageAttachment {
  id: string;
  type: 'image' | 'video' | 'document' | 'audio' | 'contact' | 'location';
  name?: string;
  mimeType?: string;
  size?: number;
  dataUrl?: string;
  duration?: number;
  contactName?: string;
  contactNumber?: string;
  latitude?: number;
  longitude?: number;
}

export interface Message {
  id: string;
  contactId: string;
  text: string;
  direction: Direction;
  createdAt: string;
  localStatus: 'saved-locally-not-delivered';
  historical: boolean;
  attachments?: MessageAttachment[];
}

export interface Group {
  id: string;
  name: string;
  photoDataUrl?: string | null;
  memberIds: string[];
  createdAt: string;
  order: number;
}

export type CallKind = 'received' | 'outgoing' | 'missed';
export interface CallRecord {
  id: string;
  contactId: string;
  kind: CallKind;
  createdAt: string;
  durationSeconds: number;
  video: boolean;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderContactId: string | null;
  senderName: string;
  senderColor: string;
  text: string;
  direction: Direction;
  createdAt: string;
  historical: boolean;
  attachments?: MessageAttachment[];
}

export interface Community {
  id: string;
  name: string;
  photoDataUrl?: string | null;
  groupIds: string[];
  createdAt: string;
  order: number;
}

export interface StatusUpdate {
  id: string;
  ownerId: string;
  ownerName: string;
  mediaType: 'image' | 'video';
  mediaDataUrl: string;
  mimeType: string;
  fileName: string;
  size: number;
  caption: string;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
}

export interface AppProfile {
  name: string;
  about: string;
  phoneNumber: string;
  photoDataUrl: string | null;
}

export type AppPreferenceValue = boolean | string | number;
export interface AppPreference { id: string; value: AppPreferenceValue }

export interface BackupFile {
  format: 'local-message-simulator-backup';
  version: 4;
  exportedAt: string;
  contacts: Contact[];
  messages: Message[];
  groups: Group[];
  groupMessages: GroupMessage[];
  communities: Community[];
  statuses: StatusUpdate[];
  appProfile?: AppProfile;
  preferences?: AppPreference[];
  calls?: CallRecord[];
}

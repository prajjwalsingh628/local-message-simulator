import type { AppPreference, AppProfile, BackupFile, CallRecord, Community, Contact, Group, GroupMessage, Message, MessageAttachment, StatusUpdate } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validateAttachments(value: unknown): MessageAttachment[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('A message attachment list in this backup is invalid.');
  return value.map((entry) => {
    if (!isRecord(entry)
      || typeof entry.id !== 'string'
      || !['image', 'video', 'document', 'audio', 'contact', 'location'].includes(String(entry.type))) {
      throw new Error('A message attachment in this backup is incomplete.');
    }
    for (const key of ['name', 'mimeType', 'dataUrl', 'contactName', 'contactNumber'] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') throw new Error('A message attachment has invalid text data.');
    }
    for (const key of ['size', 'duration', 'latitude', 'longitude'] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== 'number') throw new Error('A message attachment has invalid numeric data.');
    }
    return {
      id: entry.id,
      type: entry.type as MessageAttachment['type'],
      ...(typeof entry.name === 'string' ? { name: entry.name } : {}),
      ...(typeof entry.mimeType === 'string' ? { mimeType: entry.mimeType } : {}),
      ...(typeof entry.dataUrl === 'string' ? { dataUrl: entry.dataUrl } : {}),
      ...(typeof entry.size === 'number' ? { size: entry.size } : {}),
      ...(typeof entry.duration === 'number' ? { duration: entry.duration } : {}),
      ...(typeof entry.contactName === 'string' ? { contactName: entry.contactName } : {}),
      ...(typeof entry.contactNumber === 'string' ? { contactNumber: entry.contactNumber } : {}),
      ...(typeof entry.latitude === 'number' ? { latitude: entry.latitude } : {}),
      ...(typeof entry.longitude === 'number' ? { longitude: entry.longitude } : {})
    };
  });
}

export function validateBackup(value: unknown): BackupFile {
  if (!isRecord(value)
    || value.format !== 'local-message-simulator-backup'
    || (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4)
    || !Array.isArray(value.contacts)
    || !Array.isArray(value.messages)) {
    throw new Error('This file is not a supported local app backup.');
  }

  const contacts: Contact[] = value.contacts.map((entry, index) => {
    if (!isRecord(entry)
      || typeof entry.id !== 'string'
      || typeof entry.name !== 'string'
      || typeof entry.countryCode !== 'string'
      || typeof entry.phoneNumber !== 'string'
      || typeof entry.createdAt !== 'string'
      || !isValidDate(entry.createdAt)
      || (entry.lastModifiedAt !== undefined && !isValidDate(entry.lastModifiedAt))
      || (entry.order !== undefined && typeof entry.order !== 'number')
      || (entry.photoDataUrl !== undefined && entry.photoDataUrl !== null && typeof entry.photoDataUrl !== 'string')) {
      throw new Error('A contact record in this file is incomplete.');
    }
    return {
      id: entry.id,
      name: entry.name,
      countryCode: entry.countryCode,
      phoneNumber: entry.phoneNumber,
      avatarInfo: { kind: 'placeholder' },
      photoDataUrl: typeof entry.photoDataUrl === 'string' ? entry.photoDataUrl : null,
      createdAt: entry.createdAt,
      lastModifiedAt: typeof entry.lastModifiedAt === 'string' ? entry.lastModifiedAt : entry.createdAt,
      order: typeof entry.order === 'number' ? entry.order : index
    };
  });

  const contactIds = new Set(contacts.map((contact) => contact.id));
  if (contactIds.size !== contacts.length) throw new Error('The backup contains duplicate contact IDs.');

  const messages: Message[] = value.messages.map((entry) => {
    if (!isRecord(entry)
      || typeof entry.id !== 'string'
      || typeof entry.contactId !== 'string'
      || !contactIds.has(entry.contactId)
      || typeof entry.text !== 'string'
      || (entry.direction !== 'outgoing' && entry.direction !== 'incoming')
      || !isValidDate(entry.createdAt)
      || (entry.localStatus !== undefined && entry.localStatus !== 'saved-locally-not-delivered')
      || (entry.historical !== undefined && typeof entry.historical !== 'boolean')) {
      throw new Error('A message record in this file is incomplete or unsupported.');
    }
    return {
      id: entry.id,
      contactId: entry.contactId,
      text: entry.text,
      direction: entry.direction,
      createdAt: entry.createdAt,
      localStatus: 'saved-locally-not-delivered',
      historical: entry.historical === true,
      attachments: validateAttachments(entry.attachments)
    };
  });

  const groupEntries = Array.isArray(value.groups) ? value.groups : [];
  const groups: Group[] = groupEntries.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string'
      || !stringArray(entry.memberIds) || !isValidDate(entry.createdAt)
      || (entry.photoDataUrl !== undefined && entry.photoDataUrl !== null && typeof entry.photoDataUrl !== 'string')) {
      throw new Error('A group record in this file is incomplete.');
    }
    return { id: entry.id, name: entry.name, memberIds: entry.memberIds.filter((id) => contactIds.has(id)), createdAt: entry.createdAt,
      order: typeof entry.order === 'number' ? entry.order : index, photoDataUrl: typeof entry.photoDataUrl === 'string' ? entry.photoDataUrl : null };
  });
  const groupIds = new Set(groups.map((group) => group.id));
  if (groupIds.size !== groups.length) throw new Error('The backup contains duplicate group IDs.');

  const groupMessageEntries = Array.isArray(value.groupMessages) ? value.groupMessages : [];
  const groupMessages: GroupMessage[] = groupMessageEntries.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.groupId !== 'string' || !groupIds.has(entry.groupId)
      || (entry.senderContactId !== null && entry.senderContactId !== undefined && typeof entry.senderContactId !== 'string')
      || typeof entry.senderName !== 'string' || typeof entry.senderColor !== 'string' || typeof entry.text !== 'string'
      || (entry.direction !== 'outgoing' && entry.direction !== 'incoming') || !isValidDate(entry.createdAt)) {
      throw new Error('A group message in this backup is incomplete.');
    }
    return { id: entry.id, groupId: entry.groupId, senderContactId: typeof entry.senderContactId === 'string' ? entry.senderContactId : null,
      senderName: entry.senderName, senderColor: entry.senderColor, text: entry.text, direction: entry.direction,
      createdAt: entry.createdAt, historical: entry.historical === true, attachments: validateAttachments(entry.attachments) };
  });

  const communityEntries = Array.isArray(value.communities) ? value.communities : [];
  const communities: Community[] = communityEntries.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string' || !stringArray(entry.groupIds)
      || !isValidDate(entry.createdAt) || (entry.photoDataUrl !== undefined && entry.photoDataUrl !== null && typeof entry.photoDataUrl !== 'string')) {
      throw new Error('A community record in this backup is incomplete.');
    }
    return { id: entry.id, name: entry.name, groupIds: entry.groupIds.filter((id) => groupIds.has(id)), createdAt: entry.createdAt,
      order: typeof entry.order === 'number' ? entry.order : index, photoDataUrl: typeof entry.photoDataUrl === 'string' ? entry.photoDataUrl : null };
  });

  const statusEntries = Array.isArray(value.statuses) ? value.statuses : [];
  const statuses: StatusUpdate[] = statusEntries.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.ownerId !== 'string'
      || (entry.ownerId !== 'me' && !contactIds.has(entry.ownerId)) || typeof entry.ownerName !== 'string'
      || (entry.mediaType !== 'image' && entry.mediaType !== 'video') || typeof entry.mediaDataUrl !== 'string'
      || typeof entry.mimeType !== 'string' || typeof entry.fileName !== 'string' || typeof entry.size !== 'number'
      || typeof entry.caption !== 'string' || !isValidDate(entry.createdAt) || !isValidDate(entry.expiresAt)
      || typeof entry.viewed !== 'boolean') {
      throw new Error('A status update in this backup is incomplete.');
    }
    return { id: entry.id, ownerId: entry.ownerId, ownerName: entry.ownerName, mediaType: entry.mediaType as StatusUpdate['mediaType'],
      mediaDataUrl: entry.mediaDataUrl, mimeType: entry.mimeType, fileName: entry.fileName, size: entry.size,
      caption: entry.caption, createdAt: entry.createdAt, expiresAt: entry.expiresAt, viewed: entry.viewed };
  }).filter((status) => Date.parse(status.expiresAt) > Date.now());

  const callEntries = Array.isArray(value.calls) ? value.calls : [];
  const calls: CallRecord[] = callEntries.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.contactId !== 'string'
      || !contactIds.has(entry.contactId) || !['received', 'outgoing', 'missed'].includes(String(entry.kind))
      || !isValidDate(entry.createdAt) || typeof entry.durationSeconds !== 'number' || entry.durationSeconds < 0
      || typeof entry.video !== 'boolean') throw new Error('A call record in this backup is incomplete.');
    return { id: entry.id, contactId: entry.contactId, kind: entry.kind as CallRecord['kind'], createdAt: entry.createdAt, durationSeconds: entry.durationSeconds, video: entry.video };
  });

  const messageIds = new Set(messages.map((message) => message.id));
  if (messageIds.size !== messages.length) throw new Error('The backup contains duplicate message IDs.');

  let appProfile: AppProfile | undefined;
  if (value.appProfile !== undefined) {
    if (!isRecord(value.appProfile) || typeof value.appProfile.name !== 'string' || typeof value.appProfile.about !== 'string'
      || typeof value.appProfile.phoneNumber !== 'string'
      || (value.appProfile.photoDataUrl !== null && typeof value.appProfile.photoDataUrl !== 'string')) throw new Error('The profile in this backup is invalid.');
    appProfile = { name: value.appProfile.name, about: value.appProfile.about, phoneNumber: value.appProfile.phoneNumber, photoDataUrl: value.appProfile.photoDataUrl as string | null };
  }
  const preferenceEntries = Array.isArray(value.preferences) ? value.preferences : [];
  const preferences: AppPreference[] = preferenceEntries.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !['string', 'boolean', 'number'].includes(typeof entry.value)) throw new Error('A setting in this backup is invalid.');
    return { id: entry.id, value: entry.value as AppPreference['value'] };
  });
  return {
    format: 'local-message-simulator-backup', version: 4,
    exportedAt: isValidDate(value.exportedAt) ? value.exportedAt : new Date().toISOString(),
    contacts, messages, groups, groupMessages, communities, statuses, calls,
    ...(appProfile ? { appProfile } : {}), preferences
  };
}

export function makeBackup(data: Omit<BackupFile, 'format' | 'version' | 'exportedAt'>): BackupFile {
  return { format: 'local-message-simulator-backup', version: 4, exportedAt: new Date().toISOString(), ...data };
}

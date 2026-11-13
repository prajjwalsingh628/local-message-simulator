import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  Camera,
  CheckCheck,
  ChevronRight,
  CircleDashed,
  CircleUserRound,
  Bell,
  LockKeyhole,
  Palette,
  ArchiveRestore,
  CircleHelp,
  ListChecks,
  Star,
  Smartphone,
  Database,
  UserRoundPen,
  Copy,
  Download,
  FileClock,
  FileText,
  ImagePlus,
  Info,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Plus,
  Search,
  Send,
  Settings2,
  Smile,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  Video,
  Music2,
  ContactRound,
  Mic,
  Pause,
  X
} from 'lucide-react';
import {
  clearLocalData,
  readAllData,
  removeContactAndMessages,
  removeMessage,
  removeGroup,
  replaceLocalData,
  saveCommunity,
  saveContact,
  saveGroup,
  saveGroupMessage,
  saveMessage,
  saveStatus,
  savePreference,
  saveAppProfile,
  updateStatusViewed,
  saveCall,
  removeCall
} from './domain/db';
import { makeBackup, validateBackup } from './domain/backup';
import { fileToDataUrl, formatBytes } from './domain/media';
import type { AppPreferenceValue, AppProfile, CallRecord, Community, Contact, Group, GroupMessage, Message, MessageAttachment, StatusUpdate } from './domain/types';

type Screen = 'home' | 'conversation' | 'contact' | 'profile' | 'updates' | 'calls' | 'communities' | 'group-conversation';
type Direction = Message['direction'];
type Popup = 'attachments' | null;
type AttachmentType = 'image' | 'video' | 'document' | 'audio';
type PendingConfirm = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
};

const EMOJI_CHOICES = ['🙂', '😊', '🙏', '❤️', '✨', '👍', '🎉', '🌿', '🥹', '💛', '👏', '☀️'];

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferredInstallPrompt: InstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  // Capture this before React effects run so Chrome's one-shot install event is never missed.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new Event('app-install-prompt-ready'));
  });
}

function sortMessages(items: Message[]): Message[] {
  return [...items].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'record-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

function localDayKey(value: string): string {
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
}

function dateHeading(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (localDayKey(value) === localDayKey(now.toISOString())) return 'Today';
  if (localDayKey(value) === localDayKey(yesterday.toISOString())) return 'Yesterday';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function hasReplyAfter(createdAt: string, allMessages: Array<{ direction: Direction; createdAt: string }>): boolean {
  const time = Date.parse(createdAt);
  return allMessages.some((message) => message.direction === 'incoming' && Date.parse(message.createdAt) >= time);
}

function toLocalInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatPhone(countryCode: string, phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  const grouped = digits.length === 10 ? digits.slice(0, 5) + ' ' + digits.slice(5) : digits;
  return [countryCode.trim(), grouped].filter(Boolean).join(' ');
}

function useVisibleViewportHeight(): void {
  useEffect(() => {
    const updateHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', height + 'px');
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    window.visualViewport?.addEventListener('resize', updateHeight);
    window.visualViewport?.addEventListener('scroll', updateHeight);
    return () => {
      window.removeEventListener('resize', updateHeight);
      window.visualViewport?.removeEventListener('resize', updateHeight);
      window.visualViewport?.removeEventListener('scroll', updateHeight);
    };
  }, []);
}

function Avatar({ contact }: { contact: Contact }) {
  const isAashna = contact.name.trim().toLowerCase() === 'aashna mam';
  const initials = contact.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
  return (
    <span
      className={'avatar ' + (isAashna ? 'avatar-primary' : 'avatar-initials')}
      style={{ '--avatar-tone': String((contact.order * 61 + 138) % 360) } as CSSProperties}
      aria-hidden="true"
    >
      {contact.photoDataUrl ? <img src={contact.photoDataUrl} alt="" /> : isAashna ? <UserRound size={24} strokeWidth={1.7} /> : initials || <UserRound size={22} />}
    </span>
  );
}

function IconButton({
  label,
  children,
  onClick,
  className = '',
  disabled = false
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button className={'icon-button ' + className} type="button" aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

type MainTab = 'home' | 'profile' | 'updates' | 'calls' | 'communities';

function BottomNavigation({ current, onHome, onProfile, onUpdates, onCalls, onCommunities }: {
  current: MainTab;
  onHome: () => void;
  onProfile: () => void;
  onUpdates: () => void;
  onCalls: () => void;
  onCommunities: () => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <button type="button" className={'nav-item ' + (current === 'updates' ? 'active' : '')} aria-current={current === 'updates' ? 'page' : undefined} onClick={onUpdates} aria-label="Updates">
        <CircleDashed size={22} strokeWidth={1.9} /><span>Updates</span>
      </button>
      <button type="button" className={'nav-item ' + (current === 'calls' ? 'active' : '')} aria-current={current === 'calls' ? 'page' : undefined} onClick={onCalls} aria-label="Calls">
        <Phone size={21} strokeWidth={1.9} /><span>Calls</span>
      </button>
      <button type="button" className={'nav-item ' + (current === 'communities' ? 'active' : '')} aria-current={current === 'communities' ? 'page' : undefined} onClick={onCommunities} aria-label="Communities">
        <UsersRound size={22} strokeWidth={1.9} /><span>Communities</span>
      </button>
      <button
        type="button"
        className={'nav-item ' + (current === 'home' ? 'active' : '')}
        aria-current={current === 'home' ? 'page' : undefined}
        onClick={onHome}
      >
        <MessageCircle size={22} strokeWidth={2} fill={current === 'home' ? 'currentColor' : 'none'} /><span>Chats</span>
      </button>
      <button
        type="button"
        className={'nav-item ' + (current === 'profile' ? 'active' : '')}
        aria-current={current === 'profile' ? 'page' : undefined}
        onClick={onProfile}
      >
        <UserRound size={21} strokeWidth={1.9} /><span>You</span>
      </button>
    </nav>
  );
}

function latestMessageByContact(messages: Message[]): Map<string, Message> {
  const latest = new Map<string, Message>();
  for (const message of messages) {
    const previous = latest.get(message.contactId);
    if (!previous || Date.parse(message.createdAt) > Date.parse(previous.createdAt)) latest.set(message.contactId, message);
  }
  return latest;
}

function HomeScreen({
  contacts,
  messages,
  groups,
  groupMessages: groupMessageList,
  search,
  setSearch,
  onOpenContact,
  onOpenGroup,
  onProfile,
  onUpdates,
  onCalls,
  onCommunities,
  onAddContact,
  onToast
}: {
  contacts: Contact[];
  messages: Message[];
  groups: Group[];
  groupMessages: GroupMessage[];
  search: string;
  setSearch: (value: string) => void;
  onOpenContact: (id: string) => void;
  onOpenGroup: (id: string) => void;
  onProfile: () => void;
  onUpdates: () => void;
  onCalls: () => void;
  onCommunities: () => void;
  onAddContact: () => void;
  onToast: (value: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const latest = latestMessageByContact(messages);
  const visibleContacts = [...contacts]
    .filter((contact) => contact.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((left, right) => {
      const leftMessage = latest.get(left.id);
      const rightMessage = latest.get(right.id);
      if (leftMessage && rightMessage) return Date.parse(rightMessage.createdAt) - Date.parse(leftMessage.createdAt) || left.order - right.order;
      if (leftMessage) return -1;
      if (rightMessage) return 1;
      return left.order - right.order;
    });

  return (
    <section className="screen home-screen" aria-label="Chats">
      <header className="home-header">
        <div className="home-actions">
          <div className="home-more-anchor"><IconButton label="More options" onClick={() => setMenuOpen((value) => !value)} className="home-more" aria-expanded={menuOpen}><MoreHorizontal size={24} /></IconButton>{menuOpen && <div className="more-menu home-more-menu">{['Select chats', 'Read all', 'Starred messages', 'Settings'].map((item) => <button type="button" key={item} onClick={() => { setMenuOpen(false); if (item === 'Settings') onProfile(); else onToast(item === 'Read all' ? 'All chats marked as read.' : `${item} is ready.`); }}><span>{item}</span></button>)}</div>}</div>
          <div className="home-action-right">
            <div className="home-glass-pill" aria-label="Payment and camera shortcuts">
              <span className="rupee-mark" aria-hidden="true">₹</span>
              <Camera size={24} strokeWidth={2.4} aria-hidden="true" />
            </div>
            <IconButton label="Add contact" className="add-button" onClick={onAddContact}><Plus size={25} /></IconButton>
          </div>
        </div>
        <h1>Chats</h1>
        <label className="search-field">
          <Search size={20} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            placeholder="Search"
            aria-label="Search contacts by name"
          />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={16} /></button>}
        </label>
      </header>

      <div className="contact-list-area">
        <div className="archived-row" aria-label="Archived">
          <Archive size={21} strokeWidth={1.75} />
          <span>Archived</span>
        </div>
        <div className="contact-list-scroll">
          {groups.length > 0 && <>
            <div className="list-section-title-row"><h3 className="list-section-title">GROUPS</h3></div>
            {groups.filter((group) => group.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((group) => {
              const latest = groupMessageList.filter((message) => message.groupId === group.id).at(-1);
              return <button type="button" className="contact-row" key={group.id} onClick={() => onOpenGroup(group.id)}>
                <span className="community-icon small">{group.photoDataUrl ? <img src={group.photoDataUrl} alt="" /> : <UsersRound />}</span>
                <span className="contact-copy"><span className="contact-name">{group.name}</span><span className="contact-preview">{latest?.text || `${group.memberIds.length} members`}</span></span>
                <span className="contact-trailing"><span className="contact-time">{latest ? formatTime(latest.createdAt) : ''}</span></span>
              </button>;
            })}
          </>}
          {visibleContacts.map((contact) => {
            const message = latest.get(contact.id);
            return (
              <button className="contact-row" type="button" key={contact.id} onClick={() => onOpenContact(contact.id)}>
                <Avatar contact={contact} />
                <span className="contact-copy">
                  <span className="contact-name">{contact.name}</span>
                <span className="contact-preview">{message ? message.text || (message.attachments?.[0]?.type === 'image' ? 'Photo' : message.attachments?.[0]?.type === 'video' ? 'Video' : message.attachments?.[0]?.name ?? 'Attachment') : 'No messages yet'}</span>
                </span>
                <span className="contact-trailing">
                  <span className="contact-time">{message ? formatTime(message.createdAt) : ''}</span>
                </span>
              </button>
            );
          })}
          {visibleContacts.length === 0 && (
            <div className="empty-contacts">
              <span className="empty-emblem"><MessageCircle size={22} /></span>
              <strong>{search ? 'No contacts found' : 'No contacts yet'}</strong>
              <p>{search ? 'Try another name.' : 'Add a contact to start a conversation.'}</p>
              {!search && <button type="button" className="primary-action" onClick={onAddContact}>Add contact</button>}
            </div>
          )}
        </div>
      </div>

      <BottomNavigation current="home" onHome={() => undefined} onProfile={onProfile} onUpdates={onUpdates} onCalls={onCalls} onCommunities={onCommunities} />
    </section>
  );
}

function groupMessages<T extends { createdAt: string }>(messages: T[]): { key: string; entries: T[] }[] {
  const groups: { key: string; entries: T[] }[] = [];
  for (const message of [...messages].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))) {
    const key = localDayKey(message.createdAt);
    const current = groups[groups.length - 1];
    if (!current || current.key !== key) groups.push({ key, entries: [message] });
    else current.entries.push(message);
  }
  return groups;
}

function ConversationScreen({
  contact,
  messages,
  onBack,
  onInfo,
  onDelete,
  onDeleteContact,
  onSend,
  onSendAttachment,
  onNewEntry,
  isMuted,
  onToggleMute,
  onToast
}: {
  contact: Contact;
  messages: Message[];
  onBack: () => void;
  onInfo: () => void;
  onDelete: (message: Message) => void;
  onDeleteContact: () => void;
  onSend: (text: string) => Promise<void>;
  onSendAttachment: (attachment: MessageAttachment) => Promise<void>;
  onNewEntry: (direction: Direction, currentTime: boolean) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onToast: (value: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [popup, setPopup] = useState<Popup>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTypeRef = useRef<AttachmentType>('image');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStartedRef = useRef(0);
  const groups = useMemo(() => groupMessages(messages), [messages]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = Math.min(element.scrollHeight, 132) + 'px';
  }, [draft]);

  const send = async () => {
    const value = draft.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await onSend(value);
      setDraft('');
      setEmojiOpen(false);
      textareaRef.current?.focus();
    } catch {
      // The app-level save flow displays the storage error.
    } finally {
      setSending(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    setDraft((value) => value + emoji);
    setEmojiOpen(false);
    textareaRef.current?.focus();
  };

  const chooseAttachment = (type: AttachmentType) => {
    fileTypeRef.current = type;
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === 'image' ? 'image/*,video/*' : type === 'video' ? 'video/*' : type === 'audio' ? 'audio/*' : '*/*';
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.click();
    }
    setPopup(null);
  };

  const attachFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    let type: AttachmentType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : 'document';
    if (fileTypeRef.current === 'document') type = 'document';
    try {
      const dataUrl = await fileToDataUrl(file, type === 'image' ? 1800 : 0);
      let duration: number | undefined;
      if (type === 'audio' || type === 'video') duration = await new Promise<number>((resolve) => {
        const media = document.createElement(type);
        media.preload = 'metadata';
        media.onloadedmetadata = () => { resolve(Number.isFinite(media.duration) ? media.duration : 0); URL.revokeObjectURL(media.src); };
        media.onerror = () => resolve(0);
        media.src = URL.createObjectURL(file);
      });
      await onSendAttachment({ id: makeId(), type, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, dataUrl, ...(duration !== undefined ? { duration } : {}) });
    } catch (error) { window.alert(error instanceof Error ? error.message : 'This file could not be added.'); }
  };

  const voiceMessage = async () => {
    if (recording) { recorderRef.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { window.alert('Voice recording is not supported by this browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder; recorderChunksRef.current = []; recorderStartedRef.current = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size) recorderChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop()); setRecording(false);
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) return;
        try { const file = new File([blob], 'Voice message', { type: blob.type }); await onSendAttachment({ id: makeId(), type: 'audio', name: 'Voice message', mimeType: blob.type, size: blob.size, dataUrl: await fileToDataUrl(file), duration: (Date.now() - recorderStartedRef.current) / 1000 }); }
        catch { window.alert('The voice message could not be saved.'); }
      };
      recorder.start(); setRecording(true);
    } catch { window.alert('Microphone permission was not granted.'); }
  };

  const shareLocation = () => {
    if (!navigator.geolocation) { window.alert('Location is not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      void onSendAttachment({ id: makeId(), type: 'location', name: 'Location', latitude: position.coords.latitude, longitude: position.coords.longitude });
      setPopup(null);
    }, () => window.alert('Location permission was not granted.'), { enableHighAccuracy: false, timeout: 12000, maximumAge: 60_000 });
  };

  const renderAttachment = (attachment: MessageAttachment) => {
    if (attachment.type === 'image' && attachment.dataUrl) return <img className="chat-media-image" src={attachment.dataUrl} alt={attachment.name ?? 'Shared image'} />;
    if (attachment.type === 'video' && attachment.dataUrl) return <video className="chat-media-video" src={attachment.dataUrl} controls playsInline preload="metadata" />;
    if (attachment.type === 'audio' && attachment.dataUrl) return <audio className="chat-media-audio" src={attachment.dataUrl} controls preload="metadata" />;
    if (attachment.type === 'location') return <div className="attachment-card"><MapPin size={22} /><span><strong>Location</strong><small> {attachment.latitude?.toFixed(4)}, {attachment.longitude?.toFixed(4)}</small></span></div>;
    if (attachment.type === 'contact') return <div className="attachment-card"><ContactRound size={22} /><span><strong>{attachment.contactName}</strong><small>{attachment.contactNumber}</small></span></div>;
    return <a className="attachment-card" href={attachment.dataUrl} download={attachment.name || 'attachment'}><FileText size={22} /><span><strong>{attachment.name || 'Attachment'}</strong><small>{formatBytes(attachment.size ?? 0)}</small></span><Download size={16} /></a>;
  };

  return (
    <section className="screen conversation-screen" aria-label={'Chat with ' + contact.name}>
      <header className="conversation-header">
        <IconButton label="Back to chats" onClick={onBack} className="back-button"><ArrowLeft size={21} /></IconButton>
        <button type="button" className="conversation-person" onClick={onInfo} aria-label="Open contact information">
          <Avatar contact={contact} />
          <span className="conversation-person-copy"><strong>{contact.name}</strong></span>
        </button>
        <div className="call-pill" aria-label="Call shortcuts">
          <button type="button" disabled aria-label="Video call"><Video size={21} strokeWidth={2} /></button>
          <button type="button" disabled aria-label="Phone call"><Phone size={20} strokeWidth={2} /></button>
        </div>
        <IconButton label="Contact information" onClick={onInfo} className="header-info"><Info size={19} /></IconButton>
        <div className="more-anchor">
          <IconButton label="More chat options" onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal size={21} /></IconButton>
          {moreOpen && (
            <div className="more-menu">
              <button type="button" onClick={() => { setMoreOpen(false); onInfo(); }}><Info size={16} /> View contact</button>
              <button type="button" onClick={() => { setMoreOpen(false); onInfo(); }}><ImagePlus size={16} /> Media, links and docs</button>
              <button type="button" onClick={() => { setMoreOpen(false); const query = window.prompt('Search this chat'); if (query) onToast(`${messages.filter((message) => message.text.toLowerCase().includes(query.toLowerCase())).length} matching messages.`); }}><Search size={16} /> Search</button>
              <button type="button" onClick={() => { setMoreOpen(false); onToggleMute(); onToast(isMuted ? 'Notifications unmuted.' : 'Notifications muted.'); }}><Bell size={16} /> {isMuted ? 'Unmute' : 'Mute'} notifications</button>
              <button type="button" onClick={() => { setMoreOpen(false); onToast('Wallpaper options are in You → Chats → Wallpaper.'); }}><Palette size={16} /> Wallpaper</button>
              <button type="button" onClick={() => { setMoreOpen(false); onToast('No starred messages are saved yet.'); }}><Star size={16} /> Starred messages</button>
              <button type="button" className="delete-contact-menu" onClick={() => { setMoreOpen(false); onDeleteContact(); }}><Trash2 size={16} /> Delete contact</button>
            </div>
          )}
        </div>
      </header>

      <div className="conversation-wallpaper" ref={scrollRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="conversation-empty">
            <span className="empty-emblem"><MessageCircle size={21} /></span>
            <strong>No messages yet</strong>
            <p>Start the conversation below.</p>
          </div>
        ) : (
          <div className="message-stack">
            {groups.map((group) => (
              <div className="message-group" key={group.key}>
                <div className="date-divider"><span>{dateHeading(group.entries[0].createdAt)}</span></div>
                {group.entries.map((message) => (
                  <article
                    className={'message-line ' + (message.direction === 'outgoing' ? 'outgoing-line' : 'incoming-line')}
                    key={message.id}
                    onContextMenu={(event) => { event.preventDefault(); onDelete(message); }}
                  >
                    <div className="message-bubble">
                      {message.attachments?.map((attachment) => <div className="message-attachment" key={attachment.id}>{renderAttachment(attachment)}</div>)}
                      {message.text && <p>{message.text}</p>}
                      <div className="message-meta">
                        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                        {message.direction === 'outgoing' && <CheckCheck className={'double-check ' + (hasReplyAfter(message.createdAt, messages) ? 'read-check' : '')} size={16} strokeWidth={2.25} aria-label={hasReplyAfter(message.createdAt, messages) ? 'Two blue checkmarks' : 'Two grey checkmarks'} />}
                        <button type="button" className="delete-message" aria-label="Delete this message" title="Delete message" onClick={() => onDelete(message)}>
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {messages.length > 3 && (
        <button type="button" className="scroll-latest" aria-label="Scroll to latest message" onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}>
          <ArrowDown size={18} />
        </button>
      )}

      {emojiOpen && (
        <div className="emoji-tray" role="group" aria-label="Choose an emoji">
          {EMOJI_CHOICES.map((emoji) => <button type="button" key={emoji} onClick={() => insertEmoji(emoji)} aria-label={'Insert ' + emoji}>{emoji}</button>)}
        </div>
      )}

      <footer className="composer-area">
        <div className="composer-row">
          <IconButton label="Add message with date and time" className="composer-tool" onClick={() => setPopup('attachments')}><Plus size={27} strokeWidth={1.8} /></IconButton>
          <div className="input-shell">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Message"
              aria-label="Message text"
              rows={1}
              enterKeyHint="enter"
            />
            <button type="button" className={'emoji-trigger ' + (emojiOpen ? 'selected' : '')} aria-label="Open emoji picker" onClick={() => setEmojiOpen((value) => !value)}><Smile size={20} /></button>
          </div>
          <IconButton label="Take or choose a photo or video" className="composer-tool camera-tool" onClick={() => { fileTypeRef.current = 'image'; if (fileInputRef.current) { fileInputRef.current.accept = 'image/*,video/*'; fileInputRef.current.setAttribute('capture', 'environment'); fileInputRef.current.click(); } }}><Camera size={21} /></IconButton>
          <button type="button" className={'send-button ' + (recording ? 'recording' : '')} aria-label={draft.trim() ? 'Send message' : recording ? 'Stop voice message' : 'Record voice message'} disabled={sending} onClick={() => draft.trim() ? void send() : void voiceMessage()}>
            {draft.trim() ? <Send size={18} /> : recording ? <Pause size={17} fill="currentColor" /> : <Mic size={20} strokeWidth={2} />}
          </button>
        </div>
        <input ref={fileInputRef} type="file" className="visually-hidden" onChange={(event) => void attachFile(event)} />
      </footer>

      {popup && (
        <Dialog title="Add to chat" onClose={() => setPopup(null)} compact>
          <div className="tool-list">
            <button type="button" onClick={() => chooseAttachment('document')}><span className="tool-icon"><FileText size={18} /></span><span><strong>Document</strong><small>Choose a file from this device</small></span><ChevronRight size={17} /></button>
            <button type="button" onClick={() => chooseAttachment('image')}><span className="tool-icon"><ImagePlus size={18} /></span><span><strong>Photos &amp; Videos</strong><small>Choose from your library</small></span><ChevronRight size={17} /></button>
            <button type="button" onClick={() => chooseAttachment('audio')}><span className="tool-icon"><Music2 size={18} /></span><span><strong>Audio</strong><small>Choose an audio file</small></span><ChevronRight size={17} /></button>
            <button type="button" onClick={shareLocation}><span className="tool-icon"><MapPin size={18} /></span><span><strong>Location</strong><small>Save this device’s location in the chat</small></span><ChevronRight size={17} /></button>
            <button type="button" onClick={() => { setPopup(null); void onSendAttachment({ id: makeId(), type: 'contact', name: contact.name, contactName: contact.name, contactNumber: formatPhone(contact.countryCode, contact.phoneNumber) }); }}><span className="tool-icon"><ContactRound size={18} /></span><span><strong>Contact</strong><small>Share this contact card</small></span><ChevronRight size={17} /></button>
            <button type="button" onClick={() => { setPopup(null); onNewEntry('outgoing', false); }}><span className="tool-icon"><FileClock size={18} /></span><span><strong>Add message with date &amp; time</strong><small>Choose sent or received and when it appears</small></span><ChevronRight size={17} /></button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

function PhotoCropDialog({ source, onCancel, onApply }: { source: string; onCancel: () => void; onApply: (photo: string) => void }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [error, setError] = useState('');
  const crop = () => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth) return;
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const x = (image.naturalWidth - side) * (offsetX + 100) / 200;
    const y = (image.naturalHeight - side) * (offsetY + 100) / 200;
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 640;
    const context = canvas.getContext('2d');
    if (!context) { setError('Photo cropping is unavailable in this browser.'); return; }
    context.drawImage(image, x, y, side, side, 0, 0, 640, 640);
    onApply(canvas.toDataURL('image/jpeg', 0.88));
  };
  const side = dimensions.width && dimensions.height ? Math.min(dimensions.width, dimensions.height) / zoom : 0;
  const scale = side ? 280 / side : 1;
  const x = dimensions.width ? (dimensions.width - side) * (offsetX + 100) / 200 : 0;
  const y = dimensions.height ? (dimensions.height - side) * (offsetY + 100) / 200 : 0;
  return <Dialog title="Crop profile photo" onClose={onCancel} compact>
    <div className="crop-preview"><img ref={imageRef} src={source} alt="Crop preview" style={{ width: dimensions.width ? dimensions.width * scale : undefined, height: dimensions.height ? dimensions.height * scale : undefined, left: dimensions.width ? -x * scale : 0, top: dimensions.height ? -y * scale : 0 }} onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError('This image could not be opened.')} /></div>
    <p className="crop-instruction">Move the crop with the controls, then adjust the zoom.</p>
    <label className="crop-control"><span>Horizontal</span><input type="range" min="-100" max="100" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} /></label>
    <label className="crop-control"><span>Vertical</span><input type="range" min="-100" max="100" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} /></label>
    <label className="crop-control"><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary-action" onClick={onCancel}>Cancel</button><button type="button" className="primary-action" onClick={crop}>Use photo</button></div>
  </Dialog>;
}

function ContactScreen({
  contact,
  messages,
  isMuted,
  onBack,
  onSave,
  onDelete,
  onToggleMute,
  onToast
}: {
  contact: Contact;
  messages: Message[];
  isMuted: boolean;
  onBack: () => void;
  onSave: (contact: Contact) => Promise<void>;
  onDelete: () => void;
  onToggleMute: () => void;
  onToast: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contact.name);
  const [countryCode, setCountryCode] = useState(contact.countryCode || '+91');
  const [phoneNumber, setPhoneNumber] = useState(contact.phoneNumber);
  const [photoDataUrl, setPhotoDataUrl] = useState(contact.photoDataUrl ?? null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const mediaItems = messages.flatMap((message) => (message.attachments ?? []).map((attachment) => ({ message, attachment }))).filter(({ attachment }) => ['image', 'video', 'document', 'audio'].includes(attachment.type));

  const copyNumber = async () => {
    const value = formatPhone(contact.countryCode, contact.phoneNumber);
    try {
      await navigator.clipboard.writeText(value);
      onToast('Number copied.');
    } catch {
      const field = document.createElement('textarea');
      field.value = value;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      onToast(copied ? 'Number copied.' : 'Copy is unavailable in this browser.');
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      onToast('Enter a contact name.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...contact,
        name: name.trim(),
        countryCode: countryCode.trim() ? (countryCode.trim().startsWith('+') ? countryCode.trim() : '+' + countryCode.trim()) : '',
        phoneNumber: phoneNumber.replace(/\D/g, ''),
        photoDataUrl,
        lastModifiedAt: new Date().toISOString()
      });
      setEditing(false);
      onToast('Contact details saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="screen detail-screen" aria-label="Contact information">
      <header className="subpage-header">
        <IconButton label="Back to chat" onClick={onBack} className="back-button"><ArrowLeft size={21} /></IconButton>
        <h1>Contact information</h1><span className="header-spacer" />
      </header>
      <div className="detail-scroll">
        <div className="profile-card">
          <div className="contact-photo-wrap">
            <button type="button" className="contact-photo-open" aria-label="View profile photo" onClick={() => setPhotoPreviewOpen(true)}><Avatar contact={{ ...contact, photoDataUrl }} /></button>
            <input ref={photoInputRef} className="visually-hidden" type="file" accept="image/*" aria-label="Choose profile photo" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) setCropSource(URL.createObjectURL(file));
            }} />
          </div>
          {!editing ? (
            <>
              <h2>{contact.name}</h2>
              <p className="profile-phone">{formatPhone(contact.countryCode, contact.phoneNumber) || 'No phone number'}</p>
              <div className="profile-actions">
                <button type="button" onClick={() => void copyNumber()}><Copy size={18} /><span>Copy number</span></button>
                <button type="button" onClick={() => setEditing(true)}><Settings2 size={18} /><span>Edit contact</span></button>
              </div>
            </>
          ) : (
            <form className="edit-contact-form" onSubmit={(event) => void save(event)}>
              <label><span>Contact name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" required /></label>
              <div className="phone-edit-grid">
                <label><span>Country code</span><input value={countryCode} onChange={(event) => setCountryCode(event.target.value)} inputMode="tel" /></label>
                <label><span>Phone number</span><input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} inputMode="tel" /></label>
              </div>
              <div className="form-actions">
                <button type="button" className="secondary-action" onClick={() => setEditing(false)}>Cancel</button>
                <button type="submit" className="primary-action" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          )}
        </div>
        {!editing && <>
          <div className="contact-quick-actions">
            <button type="button" onClick={() => onToast('Calls are visual only in this app.')}><Phone size={19} /><span>Audio</span></button>
            <button type="button" onClick={() => onToast('Video calls are visual only in this app.')}><Video size={19} /><span>Video</span></button>
            <button type="button" onClick={() => { const query = window.prompt('Search this chat'); if (query) onToast(`${messages.filter((message) => message.text.toLowerCase().includes(query.toLowerCase())).length} matching messages.`); }}><Search size={19} /><span>Search</span></button>
          </div>
          <button type="button" className="settings-row" onClick={() => setMediaOpen(true)}><span className="settings-row-icon"><ImagePlus size={18} /></span><span><strong>Media, links and docs</strong><small>{mediaItems.length} shared items</small></span><ChevronRight size={17} /></button>
          <button type="button" className="settings-row" onClick={() => onToast('Starred messages are available from chat options.')}><span className="settings-row-icon"><Star size={18} /></span><span><strong>Starred messages</strong></span><ChevronRight size={17} /></button>
          <div className="settings-row"><span className="settings-row-icon"><Bell size={18} /></span><span><strong>Mute notifications</strong><small>{isMuted ? 'Muted on this device' : 'Off'}</small></span><button className={'ios-toggle ' + (isMuted ? 'on' : '')} type="button" role="switch" aria-checked={isMuted} aria-label="Mute notifications" onClick={onToggleMute}><i /></button></div>
          <button type="button" className="settings-row" onClick={() => onToast('Wallpaper can be changed in You → Chats → Wallpaper.')}><span className="settings-row-icon"><Palette size={18} /></span><span><strong>Chat wallpaper</strong></span><ChevronRight size={17} /></button>
          <button type="button" className="settings-row" onClick={() => onToast('Disappearing messages settings are in You → Privacy.')}><span className="settings-row-icon"><FileClock size={18} /></span><span><strong>Disappearing messages</strong><small>Off</small></span><ChevronRight size={17} /></button>
          <div className="settings-note contact-encryption"><LockKeyhole size={16} /><span><strong>Encryption</strong><p>This display-only chat is stored in this browser and is not connected to a messaging service.</p></span></div>
          <button type="button" className="settings-row block-contact-row" onClick={() => onToast('Blocking is not connected to a real account.')}><span className="settings-row-icon"><LockKeyhole size={18} /></span><span><strong>Block {contact.name}</strong><small>Visual-only control</small></span><ChevronRight size={17} /></button>
        </>}
        {!editing && (
          <button type="button" className="settings-row delete-contact-row" onClick={onDelete}>
            <span className="settings-row-icon"><Trash2 size={18} /></span>
            <span><strong>Delete contact</strong><small>Remove this contact and its messages</small></span>
            <ChevronRight size={17} />
          </button>
        )}
      </div>
      {cropSource && <PhotoCropDialog source={cropSource} onCancel={() => { URL.revokeObjectURL(cropSource); setCropSource(null); }} onApply={(photo) => { setPhotoDataUrl(photo); URL.revokeObjectURL(cropSource); setCropSource(null); }} />}
      {photoPreviewOpen && <Dialog title={contact.name} onClose={() => setPhotoPreviewOpen(false)} compact><div className="contact-photo-viewer">{photoDataUrl ? <img src={photoDataUrl} alt={`${contact.name} profile`} /> : <div className="contact-photo-placeholder"><Avatar contact={{ ...contact, photoDataUrl: null }} /></div>}<button className="primary-action" type="button" onClick={() => { setPhotoPreviewOpen(false); photoInputRef.current?.click(); }}>Edit photo</button></div></Dialog>}
      {mediaOpen && <Dialog title="Media, links and docs" onClose={() => setMediaOpen(false)} compact><div className="shared-media-list">{mediaItems.length ? mediaItems.map(({ message, attachment }) => <div key={attachment.id} className="shared-media-item">{attachment.type === 'image' && attachment.dataUrl ? <img src={attachment.dataUrl} alt={attachment.name ?? 'Shared image'} /> : attachment.type === 'video' && attachment.dataUrl ? <video src={attachment.dataUrl} controls playsInline /> : <span>{attachment.name ?? attachment.type}</span>}<small>{formatTime(message.createdAt)} · {attachment.name ?? attachment.type}</small></div>) : <p className="settings-note">No shared media in this chat yet.</p>}</div></Dialog>}
    </section>
  );
}

const SETTINGS_ROWS: Record<string, { label: string; icon: ReactNode; kind?: 'toggle' | 'choice'; choices?: string[] }[]> = {
  Avatar: [{ label: 'Avatar stickers', icon: <UserRound size={18} /> }, { label: 'Use profile avatar', icon: <CircleUserRound size={18} />, kind: 'toggle' }],
  Lists: [{ label: 'Default chat list', icon: <ListChecks size={18} />, kind: 'choice', choices: ['All', 'Unread', 'Favorites', 'Groups'] }],
  'Broadcast messages': [{ label: 'Broadcast lists', icon: <MessageCircle size={18} /> }],
  'Starred messages': [{ label: 'Show starred messages', icon: <Star size={18} />, kind: 'toggle' }],
  'Linked devices': [{ label: 'Device linking', icon: <Smartphone size={18} /> }],
  Account: [{ label: 'Security notifications', icon: <LockKeyhole size={18} />, kind: 'toggle' }, { label: 'Two-step verification', icon: <LockKeyhole size={18} /> }, { label: 'Change number', icon: <Phone size={18} /> }],
  Privacy: [
    { label: 'Last seen and online', icon: <CircleUserRound size={18} />, kind: 'choice', choices: ['Everyone', 'My contacts', 'Nobody'] },
    { label: 'Profile photo', icon: <ImagePlus size={18} />, kind: 'choice', choices: ['Everyone', 'My contacts', 'Nobody'] },
    { label: 'About', icon: <Info size={18} />, kind: 'choice', choices: ['Everyone', 'My contacts', 'Nobody'] },
    { label: 'Read receipts', icon: <CheckCheck size={18} />, kind: 'toggle' },
    { label: 'Disappearing messages', icon: <FileClock size={18} />, kind: 'choice', choices: ['Off', '24 hours', '7 days', '90 days'] },
    { label: 'Groups', icon: <UsersRound size={18} />, kind: 'choice', choices: ['Everyone', 'My contacts'] },
    { label: 'Blocked contacts', icon: <UserRound size={18} /> }
  ],
  Chats: [
    { label: 'Theme', icon: <Palette size={18} />, kind: 'choice', choices: ['System', 'Light', 'Dark'] },
    { label: 'Wallpaper', icon: <ImagePlus size={18} />, kind: 'choice', choices: ['Default', 'Warm', 'Minimal'] },
    { label: 'Chat backup', icon: <ArchiveRestore size={18} /> },
    { label: 'Keep chats archived', icon: <Archive size={18} />, kind: 'toggle' }
  ],
  Notifications: [
    { label: 'Message notifications', icon: <Bell size={18} />, kind: 'toggle' },
    { label: 'Group notifications', icon: <UsersRound size={18} />, kind: 'toggle' },
    { label: 'Show previews', icon: <MessageCircle size={18} />, kind: 'toggle' },
    { label: 'In-app sounds', icon: <Music2 size={18} />, kind: 'toggle' },
    { label: 'Vibrate', icon: <Bell size={18} />, kind: 'choice', choices: ['Off', 'Default', 'Long'] }
  ],
  'Storage and data': [{ label: 'Network usage', icon: <Database size={18} /> }, { label: 'Media auto-download', icon: <Download size={18} /> }, { label: 'Storage management', icon: <Database size={18} /> }],
  Help: [{ label: 'Help centre', icon: <CircleHelp size={18} /> }, { label: 'Contact us', icon: <MessageCircle size={18} /> }, { label: 'App information', icon: <Info size={18} /> }],
  'Tell a friend': [{ label: 'Share this app', icon: <Upload size={18} /> }]
};

function ProfileScreen({ hasData, profile, preferences, onSaveProfile, onSavePreference, onHome, onUpdates, onCalls, onCommunities, onExport, onImport, onReset, onToast, isInstalled, onInstallApp }: {
  hasData: boolean; profile: AppProfile; preferences: Record<string, AppPreferenceValue>;
  onSaveProfile: (value: AppProfile) => Promise<void>;
  onSavePreference: (id: string, value: AppPreferenceValue) => Promise<void>;
  onHome: () => void; onUpdates: () => void; onCalls: () => void; onCommunities: () => void;
  onExport: () => void; onImport: () => void; onReset: () => void; onToast: (text: string) => void;
  isInstalled: boolean; onInstallApp: () => Promise<boolean>;
}) {
  const [page, setPage] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const installApp = async () => {
    if (!await onInstallApp()) setInstallHelpOpen(true);
  };
  const saveSetting = async (key: string, value: AppPreferenceValue) => { try { await onSavePreference(key, value); } catch { onToast('Setting could not be saved.'); } };
  const openPage = (name: string) => { setPage(name); setEditing(false); };
  const closePage = () => setPage('');
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); await onSaveProfile(draft); setEditing(false); onToast('Your profile was updated.'); };
  const sections = [
    ['FAVOURITES', ['Avatar', 'Lists', 'Broadcast messages', 'Starred messages', 'Linked devices']],
    ['ACCOUNT', ['Account', 'Privacy']],
    ['PREFERENCES', ['Chats', 'Notifications', 'Storage and data', 'Help', 'Tell a friend']]
  ] as const;
  return <section className="screen detail-screen profile-screen" aria-label="You and settings">
    <header className={'profile-header ' + (page ? 'profile-subpage-header' : '')}>{page ? <><button className="settings-back" type="button" onClick={closePage}><ArrowLeft size={19} /> Back</button><h1>{page}</h1><span className="header-spacer" /></> : <h1>You</h1>}</header>
    <div className="settings-scroll">
      {!page ? <>
        <button className="self-profile-card" type="button" onClick={() => { setDraft(profile); setEditing(true); }}>
          <span className="self-avatar">{profile.photoDataUrl ? <img src={profile.photoDataUrl} alt="" /> : <UserRound size={29} />}</span>
          <span><strong>{profile.name || 'Your name'}</strong><small>{profile.about || 'Available'}</small></span><UserRoundPen size={19} />
        </button>
        {sections.map(([heading, items]) => <section className="settings-section" key={heading}><h3>{heading}</h3>{items.map((label) => <button className="settings-row" type="button" key={label} onClick={() => openPage(label)}><span className="settings-row-icon">{label === 'Privacy' ? <LockKeyhole size={18} /> : label === 'Chats' ? <MessageCircle size={18} /> : label === 'Notifications' ? <Bell size={18} /> : label === 'Account' ? <UserRound size={18} /> : label === 'Help' ? <CircleHelp size={18} /> : label === 'Storage and data' ? <Database size={18} /> : <CircleChevronIcon label={label} />}</span><span><strong>{label}</strong></span><ChevronRight size={17} /></button>)}</section>)}
        <section className="settings-section app-info-section"><h3>ABOUT THIS APP</h3><div className="settings-note"><strong>Local messaging simulator</strong><p>This is an independent demo, not WhatsApp. Messages are not sent to anyone. Contacts, messages and media stay in this browser on this device.</p></div>
          <button className="settings-row" type="button" onClick={onExport} disabled={!hasData}><span className="settings-row-icon"><Download size={18} /></span><span><strong>Export a backup</strong><small>Save your profile, preferences, contacts and chats</small></span><ChevronRight size={17} /></button>
          <button className="settings-row" type="button" onClick={onImport}><span className="settings-row-icon"><Upload size={18} /></span><span><strong>Import or restore a backup</strong><small>Restore saved records from a backup file</small></span><ChevronRight size={17} /></button>
          <button className="settings-row reset-row" type="button" onClick={onReset} disabled={!hasData}><span className="settings-row-icon"><Trash2 size={18} /></span><span><strong>Clear app data</strong><small>Remove saved profile, preferences and chats</small></span><ChevronRight size={17} /></button>
          <button className="settings-row install-app-row" type="button" onClick={() => void installApp()}><span className="settings-row-icon"><Download size={18} /></span><span><strong>{isInstalled ? 'App installed' : 'Install app'}</strong><small>{isInstalled ? 'This app is on your Home Screen' : 'Add this app to your Home Screen'}</small></span><ChevronRight size={17} /></button>
        </section>
      </> : <>
        <div className="settings-page-intro">{page === 'Chats' ? 'Personalize your conversations.' : page === 'Privacy' ? 'Choose how your information and activity appear.' : `Manage ${page.toLowerCase()} preferences.`}</div>
        {(SETTINGS_ROWS[page] ?? [{ label: page, icon: <Info size={18} /> }]).map((row) => {
          const key = `setting:${page}:${row.label}`;
          const current = row.label === 'Theme' ? preferences.theme ?? 'System' : preferences[key] ?? (row.kind === 'toggle' ? ['Read receipts', 'Show previews', 'In-app sounds'].includes(row.label) : row.choices?.[0] ?? '');
          return <div className="preference-row" key={row.label}><span className="settings-row-icon">{row.icon}</span><span className="preference-copy"><strong>{row.label}</strong>{row.kind === 'choice' && <small>{String(current)}</small>}</span>{row.kind === 'toggle' ? <button className={'ios-toggle ' + (current ? 'on' : '')} type="button" role="switch" aria-checked={Boolean(current)} aria-label={row.label} onClick={() => void saveSetting(key, !current)}><i /></button> : row.kind === 'choice' ? <select aria-label={row.label} value={String(current)} onChange={(event) => { const value = event.target.value; void saveSetting(key, value); if (row.label === 'Theme') void saveSetting('theme', value); }}>{row.choices?.map((choice) => <option key={choice}>{choice}</option>)}</select> : <button type="button" className="preference-open" onClick={() => row.label === 'Chat backup' ? onExport() : onToast(`${row.label} settings are ready to configure.`)}><ChevronRight size={18} /></button>}</div>;
        })}
        {page === 'Chats' && <button className="settings-row" type="button" onClick={() => { void saveSetting('theme', 'Dark'); }}><span className="settings-row-icon"><Palette size={18} /></span><span><strong>Reset theme to Dark</strong></span><ChevronRight size={17} /></button>}
        {page === 'Privacy' && <div className="settings-note privacy-note"><strong>Read receipts</strong><p>These controls are saved on this device. They do not affect a real messaging account.</p></div>}
      </>}
    </div>
    {!page && <BottomNavigation current="profile" onHome={onHome} onProfile={() => undefined} onUpdates={onUpdates} onCalls={onCalls} onCommunities={onCommunities} />}
    {editing && <Dialog title="Edit profile" onClose={() => setEditing(false)} compact><form className="edit-contact-form" onSubmit={(event) => void saveProfile(event)}>
      <div className="new-contact-photo"><button type="button" onClick={() => photoRef.current?.click()} aria-label="Choose profile photo">{draft.photoDataUrl ? <img src={draft.photoDataUrl} alt="" /> : <UserRound size={30} />}<span><Camera size={14} /></span></button><small>Profile photo</small><input ref={photoRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) setCropSource(URL.createObjectURL(file)); }} /></div>
      <label><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label><label><span>About</span><input value={draft.about} onChange={(event) => setDraft({ ...draft, about: event.target.value })} /></label><label><span>Phone number</span><input value={draft.phoneNumber} onChange={(event) => setDraft({ ...draft, phoneNumber: event.target.value })} inputMode="tel" /></label><div className="form-actions"><button type="button" className="secondary-action" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="primary-action">Save</button></div>
    </form>{cropSource && <PhotoCropDialog source={cropSource} onCancel={() => { URL.revokeObjectURL(cropSource); setCropSource(null); }} onApply={(photo) => { setDraft({ ...draft, photoDataUrl: photo }); URL.revokeObjectURL(cropSource); setCropSource(null); }} />}</Dialog>}
    {installHelpOpen && <Dialog title="Install this app" onClose={() => setInstallHelpOpen(false)} compact><div className="install-help"><p><strong>iPhone or iPad</strong><br />Open this page in Safari, tap Share, then choose <b>Add to Home Screen</b> and tap Add.</p><p><strong>Android</strong><br />In Chrome, open the menu and choose <b>Install app</b> or <b>Add to Home screen</b>. If an install prompt is available, use the Install app button in You.</p><button type="button" className="primary-action" onClick={() => setInstallHelpOpen(false)}>Done</button></div></Dialog>}
  </section>;
}

function CircleChevronIcon({ label }: { label: string }) { return label === 'Starred messages' ? <Star size={18} /> : label === 'Lists' ? <ListChecks size={18} /> : label === 'Linked devices' ? <Smartphone size={18} /> : label === 'Avatar' ? <CircleUserRound size={18} /> : label === 'Tell a friend' ? <Upload size={18} /> : <MessageCircle size={18} />; }

function Dialog({ title, children, onClose, compact = false }: { title: string; children: ReactNode; onClose: () => void; compact?: boolean }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal((
    <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={'dialog-panel ' + (compact ? 'compact-dialog' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-heading"><h2>{title}</h2><IconButton label="Close dialog" onClick={onClose} className="dialog-close"><X size={18} /></IconButton></div>
        {children}
      </section>
    </div>
  ), document.body);
}

function AddContactDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, countryCode: string, phoneNumber: string, photoDataUrl: string | null) => Promise<void> }) {
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd(name.trim(), countryCode.trim(), phoneNumber.replace(/\D/g, ''), photoDataUrl);
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog title="Add contact" onClose={onClose} compact>
      <form className="edit-contact-form" onSubmit={(event) => void submit(event)}>
        <div className="new-contact-photo"><button type="button" onClick={() => photoRef.current?.click()} aria-label="Choose and crop profile photo">{photoDataUrl ? <img src={photoDataUrl} alt="" /> : <CircleUserRound size={34} />}<span><Camera size={14} /></span></button><small>{photoDataUrl ? 'Change photo' : 'Add photo'}</small><input ref={photoRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; event.target.value=''; if (file) setCropSource(URL.createObjectURL(file)); }} /></div>
        <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" autoFocus required /></label>
        <div className="phone-edit-grid">
          <label><span>Country code</span><input value={countryCode} onChange={(event) => setCountryCode(event.target.value)} inputMode="tel" /></label>
          <label><span>Phone number</span><input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} inputMode="tel" /></label>
        </div>
        <div className="form-actions"><button type="button" className="secondary-action" onClick={onClose}>Cancel</button><button type="submit" className="primary-action" disabled={saving}>{saving ? 'Saving…' : 'Add contact'}</button></div>
      </form>
      {cropSource && <PhotoCropDialog source={cropSource} onCancel={() => { URL.revokeObjectURL(cropSource); setCropSource(null); }} onApply={(photo) => { setPhotoDataUrl(photo); URL.revokeObjectURL(cropSource); setCropSource(null); }} />}
    </Dialog>
  );
}

function MessageEntryDialog({
  initialDirection,
  useCurrentTime: initiallyCurrent,
  onClose,
  onSave
}: {
  initialDirection: Direction;
  useCurrentTime: boolean;
  onClose: () => void;
  onSave: (text: string, direction: Direction, createdAt: string, historical: boolean) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [useCurrentTime, setUseCurrentTime] = useState(initiallyCurrent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const date = useCurrentTime ? new Date() : new Date(dateInputRef.current?.value ?? '');
    if (!text.trim() || !Number.isFinite(date.getTime())) { setError('Enter a message and a valid date and time.'); return; }
    if (date.getTime() > Date.now()) { setError('Choose a time that is not in the future.'); return; }
    setSaving(true);
    try {
      const timestamp = date.toISOString();
      await onSave(text.trim(), direction, timestamp, !useCurrentTime && date.getTime() < Date.now() - 60_000);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The message could not be saved.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog title="Add message" onClose={onClose} compact>
      <form className="history-form" onSubmit={(event) => void submit(event)}>
        <div className="direction-switch" role="group" aria-label="Message direction">
          <button type="button" className={direction === 'outgoing' ? 'selected' : ''} onClick={() => setDirection('outgoing')}>Sent</button>
          <button type="button" className={direction === 'incoming' ? 'selected' : ''} onClick={() => setDirection('incoming')}>Received</button>
        </div>
        <label><span>Message</span><textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} required /></label>
        <label className="current-time-option"><input type="checkbox" checked={useCurrentTime} onChange={(event) => setUseCurrentTime(event.target.checked)} /><span>Use current time</span></label>
        {!useCurrentTime && <label><span>Date and time</span><input ref={dateInputRef} type="datetime-local" defaultValue={toLocalInputValue(new Date())} max={toLocalInputValue(new Date())} required /></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="secondary-action" onClick={onClose}>Cancel</button><button type="submit" className="primary-action" disabled={saving}>{saving ? 'Saving…' : 'Add message'}</button></div>
      </form>
    </Dialog>
  );
}

function UpdatesScreen({ contacts, statuses, onAddStatus, onOpenStatus, onHome, onCalls, onCommunities, onProfile }: {
  contacts: Contact[]; statuses: StatusUpdate[]; onAddStatus: (ownerId: string, file: File, caption: string) => Promise<void>;
  onOpenStatus: (status: StatusUpdate) => void; onHome: () => void; onCalls: () => void; onCommunities: () => void; onProfile: () => void;
}) {
  const [ownerId, setOwnerId] = useState('me');
  const [caption, setCaption] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mine = statuses.filter((status) => status.ownerId === 'me');
  const others = contacts.flatMap((contact) => {
    const list = statuses.filter((status) => status.ownerId === contact.id);
    return list.length ? [{ contact, list, viewed: list.every((status) => status.viewed) }] : [];
  });
  const statusRow = (contact: Contact | null, list: StatusUpdate[], viewed: boolean) => {
    const newest = list[list.length - 1];
    return <button type="button" className="status-row" key={contact?.id ?? 'me'} onClick={() => newest && onOpenStatus(newest)} disabled={!newest}>
      <span className={'status-avatar-ring ' + (viewed ? 'viewed' : '')}>{contact ? <Avatar contact={contact} /> : <span className="status-me-avatar"><UserRound size={22} /></span>}</span>
      <span className="status-copy"><strong>{contact?.name ?? 'My status'}</strong><small>{list.length} update{list.length === 1 ? '' : 's'} · {formatTime(newest.createdAt)}</small></span>
      <ChevronRight size={17} />
    </button>;
  };
  return <section className="screen detail-screen updates-screen" aria-label="Updates">
    <header className="profile-header"><h1>Updates</h1></header>
    <div className="settings-scroll">
      <h3 className="list-section-title">STATUS</h3>
      {mine.length ? statusRow(null, mine, true) : <div className="status-row status-me-empty"><span className="status-me-avatar"><UserRound size={22} /></span><span className="status-copy"><strong>My status</strong><small>Tap Add status to share an update</small></span></div>}
      <button className="status-add-row" type="button" onClick={() => setDialogOpen(true)}><span className="add-status-icon"><Plus size={20} /></span><span><strong>Add status</strong><small>Share a photo or video</small></span></button>
      <h3 className="list-section-title">RECENT UPDATES</h3>
      {others.filter((item) => !item.viewed).length ? others.filter((item) => !item.viewed).map((item) => statusRow(item.contact, item.list, false)) : <p className="status-empty">Updates from contacts will appear here.</p>}
      <h3 className="list-section-title">VIEWED UPDATES</h3>
      {others.filter((item) => item.viewed).length ? others.filter((item) => item.viewed).map((item) => statusRow(item.contact, item.list, true)) : <p className="status-empty">No viewed updates yet.</p>}
    </div>
    <BottomNavigation current="updates" onHome={onHome} onProfile={onProfile} onUpdates={() => undefined} onCalls={onCalls} onCommunities={onCommunities} />
    {dialogOpen && <Dialog title="Add status" onClose={() => setDialogOpen(false)} compact>
      <form className="edit-contact-form" onSubmit={(event) => { event.preventDefault(); inputRef.current?.click(); }}>
        <label><span>Post as</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="me">My status</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
        <label><span>Caption (optional)</span><textarea rows={2} value={caption} onChange={(event) => setCaption(event.target.value)} /></label>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; event.target.value=''; if (file) void onAddStatus(ownerId, file, caption).then(() => { setDialogOpen(false); setCaption(''); }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : 'Status could not be saved.')); }} />
        <div className="form-actions"><button type="button" className="secondary-action" onClick={() => setDialogOpen(false)}>Cancel</button><button type="submit" className="primary-action">Choose photo or video</button></div>
      </form>
    </Dialog>}
  </section>;
}

function StatusViewer({ status, allStatuses, onClose, onSelect, onViewed }: { status: StatusUpdate; allStatuses: StatusUpdate[]; onClose: () => void; onSelect: (status: StatusUpdate) => void; onViewed: (id: string) => void }) {
  const items = allStatuses.filter((item) => item.ownerId === status.ownerId);
  const [index, setIndex] = useState(Math.max(0, items.findIndex((item) => item.id === status.id)));
  const [touchY, setTouchY] = useState<number | null>(null);
  const current = items[index] ?? status;
  useEffect(() => { onViewed(current.id); const timer = window.setTimeout(() => setIndex((value) => value + 1), 5000); return () => window.clearTimeout(timer); }, [current.id, onViewed]);
  useEffect(() => { if (index >= items.length) onClose(); else onSelect(items[index]); }, [index, items.length, onClose, onSelect]);
  return <div className="status-viewer" onTouchStart={(event) => setTouchY(event.touches[0]?.clientY ?? null)} onTouchEnd={(event) => { const y = event.changedTouches[0]?.clientY ?? 0; if (touchY !== null && y - touchY > 80) onClose(); setTouchY(null); }}>
    <div className="status-progress">{items.map((item, itemIndex) => <span key={item.id}><i className={itemIndex < index ? 'done' : itemIndex === index ? 'running' : ''} /></span>)}</div>
    <header><button type="button" onClick={onClose}><ArrowLeft /></button><strong>{current.ownerName}</strong><time>{formatTime(current.createdAt)}</time></header>
    {current.mediaType === 'video' ? <video className="status-media" src={current.mediaDataUrl} autoPlay playsInline onEnded={() => setIndex((value) => value + 1)} /> : <img className="status-media" src={current.mediaDataUrl} alt={current.caption || 'Status update'} />}
    <button className="status-hit-left" aria-label="Previous update" onClick={() => setIndex((value) => Math.max(0, value - 1))} />
    <button className="status-hit-right" aria-label="Next update" onClick={() => setIndex((value) => value + 1)} />
    {current.caption && <p className="status-caption">{current.caption}</p>}
  </div>;
}

function CallsScreen({ contacts, calls, onAdd, onDelete, onHome, onProfile, onUpdates, onCommunities }: {
  contacts: Contact[]; calls: CallRecord[];
  onAdd: (entry: Omit<CallRecord, 'id'>) => Promise<void>;
  onDelete: (id: string) => void;
  onHome: () => void; onProfile: () => void; onUpdates: () => void; onCommunities: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [contactId, setContactId] = useState(contacts[0]?.id ?? '');
  const [kind, setKind] = useState<CallRecord['kind']>('outgoing');
  const [when, setWhen] = useState(toLocalInputValue(new Date()));
  const [duration, setDuration] = useState('0');
  const [video, setVideo] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactId) return;
    await onAdd({ contactId, kind, createdAt: new Date(when).toISOString(), durationSeconds: Math.max(0, Number(duration) || 0), video });
    setAdding(false);
  };
  return <section className="screen detail-screen" aria-label="Calls">
    <header className="profile-header"><h1>Calls</h1><button className="add-call-button" type="button" aria-label="Add call record" onClick={() => setAdding(true)}><Plus /></button></header>
    <div className="settings-scroll calls-list">{calls.length ? calls.map((call) => {
      const contact = contacts.find((item) => item.id === call.contactId);
      if (!contact) return null;
      const Icon = call.kind === 'missed' ? PhoneMissed : call.kind === 'received' ? PhoneIncoming : PhoneOutgoing;
      const mins = Math.floor(call.durationSeconds / 60); const secs = call.durationSeconds % 60;
      return <article className="call-row" key={call.id}><Avatar contact={contact} /><div className="call-row-copy"><strong>{contact.name}</strong><span className={'call-kind ' + (call.kind === 'missed' ? 'missed' : '')}><Icon size={15} />{call.kind === 'received' ? 'Incoming' : call.kind === 'missed' ? 'Missed' : 'Outgoing'} {call.video ? 'video call' : 'audio call'}{call.durationSeconds > 0 ? ` · ${mins}:${String(secs).padStart(2, '0')}` : ''}</span></div><time>{new Date(call.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} {formatTime(call.createdAt)}</time><IconButton label={`Delete call with ${contact.name}`} onClick={() => onDelete(call.id)}><Trash2 size={16} /></IconButton></article>;
    }) : <div className="empty-contacts"><span className="empty-emblem"><Phone size={22} /></span><strong>No calls yet</strong><p>Add a call record to keep a visual call history on this device.</p></div>}</div>
    <BottomNavigation current="calls" onHome={onHome} onProfile={onProfile} onUpdates={onUpdates} onCalls={() => undefined} onCommunities={onCommunities} />
    {adding && <Dialog title="Add call record" onClose={() => setAdding(false)} compact><form className="edit-contact-form" onSubmit={(event) => void save(event)}>
      <label><span>Contact</span><select value={contactId} onChange={(event) => setContactId(event.target.value)} required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
      <label><span>Call type</span><select value={kind} onChange={(event) => setKind(event.target.value as CallRecord['kind'])}><option value="outgoing">Outgoing</option><option value="received">Received</option><option value="missed">Missed</option></select></label>
      <label><span>Date and time</span><input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required /></label>
      <label><span>Duration in seconds</span><input type="number" min="0" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
      <label className="inline-check"><input type="checkbox" checked={video} onChange={(event) => setVideo(event.target.checked)} /> Video call</label>
      <div className="form-actions"><button className="secondary-action" type="button" onClick={() => setAdding(false)}>Cancel</button><button className="primary-action" type="submit">Save call</button></div>
    </form></Dialog>}
  </section>;
}

function CommunitiesScreen({ contacts, groups, communities, onCreateGroup, onCreateCommunity, onUpdateCommunityGroups, onOpenGroup, onHome, onUpdates, onCalls, onProfile }: {
  contacts: Contact[]; groups: Group[]; communities: Community[];
  onCreateGroup: (name: string, members: string[], photoDataUrl: string | null) => Promise<void>; onCreateCommunity: (name: string, groupIds: string[]) => Promise<void>; onUpdateCommunityGroups: (communityId: string, groupIds: string[]) => Promise<void>; onOpenGroup: (id: string) => void;
  onHome: () => void; onUpdates: () => void; onCalls: () => void; onProfile: () => void;
}) {
  const [dialog, setDialog] = useState<'group' | 'community' | 'add-groups' | null>(null);
  const [editingCommunityId, setEditingCommunityId] = useState<string | null>(null);
  const [name, setName] = useState(''); const [members, setMembers] = useState<string[]>([]); const [groupIds, setGroupIds] = useState<string[]>([]); const [groupPhoto, setGroupPhoto] = useState<string | null>(null);
  const [memberError, setMemberError] = useState(false);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog === 'group' && members.length === 0) { setMemberError(true); return; }
    if (dialog === 'group') await onCreateGroup(name.trim(), members, groupPhoto);
    else if (dialog === 'community') await onCreateCommunity(name.trim(), groupIds);
    else if (editingCommunityId) await onUpdateCommunityGroups(editingCommunityId, groupIds);
    setName(''); setMembers([]); setGroupIds([]); setGroupPhoto(null); setDialog(null); setEditingCommunityId(null); setMemberError(false);
  };
  return <section className="screen detail-screen communities-screen" aria-label="Communities"><header className="profile-header"><h1>Communities</h1></header><div className="settings-scroll">
    <button className="community-create-row" type="button" onClick={() => setDialog('community')}><span className="community-icon"><UsersRound /></span><span><strong>New community</strong><small>Bring groups together</small></span><Plus /></button>
    <button className="community-create-row" type="button" onClick={() => setDialog('group')}><span className="community-icon"><UsersRound /></span><span><strong>New group</strong><small>Group chats appear in Chats</small></span><Plus /></button>
    {groups.length > 0 && <p className="settings-note">Groups are listed in Chats. Add them to a community below.</p>}
    {communities.map((community) => <section className="community-card" key={community.id}><h2><UsersRound size={19} />{community.name}</h2>{community.groupIds.length ? community.groupIds.map((id) => { const group = groups.find((item) => item.id === id); return group ? <button type="button" key={id} onClick={() => onOpenGroup(id)}>{group.name}<ChevronRight size={16} /></button> : null; }) : <p>No groups added yet.</p>}<button type="button" className="community-add-groups" onClick={() => { setEditingCommunityId(community.id); setGroupIds(community.groupIds); setDialog('add-groups'); }}>Add groups</button></section>)}
  </div><BottomNavigation current="communities" onHome={onHome} onProfile={onProfile} onUpdates={onUpdates} onCalls={onCalls} onCommunities={() => undefined} />
  {dialog && <Dialog title={dialog === 'group' ? 'New group' : dialog === 'community' ? 'New community' : 'Add groups'} onClose={() => { setDialog(null); setEditingCommunityId(null); }} compact><form className="edit-contact-form" onSubmit={(event) => void create(event)}>{dialog !== 'add-groups' && <label><span>{dialog === 'group' ? 'Group name' : 'Community name'}</span><input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>}{dialog === 'group' && <div className="group-photo-picker"><button type="button" onClick={(event) => (event.currentTarget.nextElementSibling as HTMLInputElement).click()}>{groupPhoto ? <img src={groupPhoto} alt="" /> : <Camera size={18} />}<span>Group photo</span></button><input className="visually-hidden" type="file" accept="image/*" onChange={(event) => { const file=event.target.files?.[0]; event.target.value=''; if(file) void fileToDataUrl(file,640).then(setGroupPhoto); }} /></div>}{dialog === 'group' ? <fieldset className="member-picker"><legend>Add participants</legend>{contacts.map((contact) => <label key={contact.id}><input type="checkbox" checked={members.includes(contact.id)} onChange={(event) => { setMembers((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id)); setMemberError(false); }} />{contact.name}</label>)}</fieldset> : <fieldset className="member-picker"><legend>Add groups</legend>{groups.length ? groups.map((group) => <label key={group.id}><input type="checkbox" checked={groupIds.includes(group.id)} onChange={(event) => setGroupIds((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id))} />{group.name}</label>) : <small>Create a group first.</small>}</fieldset>}{memberError && <p className="form-error" role="alert">Select at least one participant.</p>}<div className="form-actions"><button type="button" className="secondary-action" onClick={() => { setDialog(null); setEditingCommunityId(null); }}>Cancel</button><button type="submit" className="primary-action">{dialog === 'add-groups' ? 'Save groups' : 'Create'}</button></div></form></Dialog>}
  </section>;
}

function GroupConversationScreen({ group, contacts, messages, onBack, onSend, onReceive, onSaveGroup, onDeleteGroup }: { group: Group; contacts: Contact[]; messages: GroupMessage[]; onBack: () => void; onSend: (text: string) => Promise<void>; onReceive: (text: string, senderId: string) => Promise<void>; onSaveGroup: (group: Group) => Promise<void>; onDeleteGroup: () => void }) {
  const [draft, setDraft] = useState(''); const [incomingOpen, setIncomingOpen] = useState(false); const [editOpen, setEditOpen] = useState(false); const [incomingText, setIncomingText] = useState(''); const [senderId, setSenderId] = useState(group.memberIds[0] ?? ''); const [name, setName] = useState(group.name); const [members, setMembers] = useState(group.memberIds); const [photo, setPhoto] = useState(group.photoDataUrl ?? null); const fileRef = useRef<HTMLInputElement>(null);
  const saveGroupDetails = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!name.trim() || !members.length) return; await onSaveGroup({ ...group, name: name.trim(), memberIds: members, photoDataUrl: photo }); setEditOpen(false); };
  return <section className="screen conversation-screen"><header className="conversation-header"><IconButton label="Back to chats" onClick={onBack} className="back-button"><ArrowLeft /></IconButton><button type="button" className="group-chat-identity" onClick={() => setEditOpen(true)}><span className="community-icon small">{group.photoDataUrl ? <img src={group.photoDataUrl} alt="" /> : <UsersRound />}</span><strong className="group-chat-title">{group.name}</strong></button><div className="call-pill"><button disabled aria-label="Video call"><Video /></button><button disabled aria-label="Phone call"><Phone /></button></div><IconButton label="Group options" onClick={() => setEditOpen(true)}><MoreHorizontal size={20} /></IconButton></header>
    <div className="conversation-wallpaper"><div className="message-stack">{groupMessages(messages).map((day) => <div className="message-group" key={day.key}><div className="date-divider"><span>{dateHeading(day.entries[0].createdAt)}</span></div>{day.entries.map((message) => { const sender = message.senderContactId ? contacts.find((contact) => contact.id === message.senderContactId) : null; return <article className={'message-line ' + (message.direction === 'outgoing' ? 'outgoing-line' : 'incoming-line')} key={message.id}><div className="message-bubble">{message.direction === 'incoming' && <div className="group-sender-line">{sender && <Avatar contact={sender} />}<strong className="group-sender" style={{ color: message.senderColor }}>{message.senderName}</strong></div>}{message.text && <p>{message.text}</p>}<div className="message-meta"><time>{formatTime(message.createdAt)}</time>{message.direction === 'outgoing' && <CheckCheck className="double-check" size={16} />}</div></div></article>; })}</div>)}</div></div>
    <form className="composer-area" onSubmit={(event) => { event.preventDefault(); const text = draft.trim(); if (text) void onSend(text).then(() => setDraft('')); }}><div className="composer-row"><IconButton label="Add to group chat" onClick={() => setIncomingOpen(true)}><Plus size={23} /></IconButton><div className="input-shell"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message" rows={1} /></div><button className="send-button" type="submit" disabled={!draft.trim()} aria-label="Send"><Send size={18} /></button></div></form>
    {incomingOpen && <Dialog title="Add received message" onClose={() => setIncomingOpen(false)} compact><form className="edit-contact-form" onSubmit={(event) => { event.preventDefault(); const member=contacts.find((item) => item.id === senderId); if(member && incomingText.trim()) void onReceive(incomingText.trim(), member.id).then(() => { setIncomingText(''); setIncomingOpen(false); }); }}><label><span>Member</span><select value={senderId} onChange={(event) => setSenderId(event.target.value)} required>{contacts.filter((item) => group.memberIds.includes(item.id)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Message</span><textarea rows={3} value={incomingText} onChange={(event) => setIncomingText(event.target.value)} required /></label><div className="form-actions"><button type="button" className="secondary-action" onClick={() => setIncomingOpen(false)}>Cancel</button><button className="primary-action" type="submit" disabled={!senderId}>Add message</button></div></form></Dialog>}
    {editOpen && <Dialog title="Edit group" onClose={() => setEditOpen(false)} compact><form className="edit-contact-form" onSubmit={(event) => void saveGroupDetails(event)}><div className="group-photo-picker"><button type="button" onClick={() => fileRef.current?.click()}>{photo ? <img src={photo} alt="" /> : <Camera size={18} />}<span>Change group photo</span></button><input ref={fileRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => { const file=event.target.files?.[0]; event.target.value=''; if(file) void fileToDataUrl(file, 640).then(setPhoto); }} /></div><label><span>Group name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><fieldset className="member-picker"><legend>Members</legend>{contacts.map((contact) => <label key={contact.id}><input type="checkbox" checked={members.includes(contact.id)} onChange={(event) => setMembers((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} /><Avatar contact={contact} />{contact.name}</label>)}</fieldset><div className="form-actions"><button type="button" className="danger-action" onClick={onDeleteGroup}>Delete group</button><button type="button" className="secondary-action" onClick={() => setEditOpen(false)}>Cancel</button><button type="submit" className="primary-action" disabled={!name.trim() || !members.length}>Save</button></div></form></Dialog>}
  </section>;
}

function App() {
  useVisibleViewportHeight();
  const [screen, setScreen] = useState<Screen>('home');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [statuses, setStatuses] = useState<StatusUpdate[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [appProfile, setAppProfile] = useState<AppProfile>({ name: 'You', about: 'Available', phoneNumber: '', photoDataUrl: null });
  const [preferences, setPreferences] = useState<Record<string, AppPreferenceValue>>({});
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(() => deferredInstallPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [entryRequest, setEntryRequest] = useState<{ direction: Direction; currentTime: boolean } | null>(null);
  const [activeStatus, setActiveStatus] = useState<StatusUpdate | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const refreshData = useCallback(async () => {
    const result = await readAllData();
    setContacts(result.contacts);
    setMessages(sortMessages(result.messages));
    setGroups(result.groups); setGroupMessages(result.groupMessages); setCommunities(result.communities); setStatuses(result.statuses); setCalls(result.calls);
    setPreferences(Object.fromEntries(result.preferences.map((item) => [item.id, item.value])));
    setAppProfile(result.appProfile ?? { name: 'You', about: 'Available', phoneNumber: '', photoDataUrl: null });
  }, []);

  useEffect(() => {
    let cancelled = false;
    readAllData()
      .then((result) => {
        if (cancelled) return;
        setContacts(result.contacts);
        setMessages(sortMessages(result.messages));
        setGroups(result.groups); setGroupMessages(result.groupMessages); setCommunities(result.communities); setStatuses(result.statuses); setCalls(result.calls);
        setPreferences(Object.fromEntries(result.preferences.map((item) => [item.id, item.value])));
        setAppProfile(result.appProfile ?? { name: 'You', about: 'Available', phoneNumber: '', photoDataUrl: null });
      })
      .catch((error: unknown) => { if (!cancelled) setStorageError(error instanceof Error ? error.message : 'Saved data could not be opened.'); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const theme = String(preferences.theme ?? 'System').toLowerCase();
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'light' || (theme === 'system' && media.matches) ? 'light' : ''; };
    apply();
    if (theme === 'system') media.addEventListener('change', apply);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' || (theme === 'system' && media.matches) ? '#f2f2ed' : '#080a09');
    return () => media.removeEventListener('change', apply);
  }, [preferences.theme]);

  const persistPreference = async (id: string, value: AppPreferenceValue) => {
    await savePreference({ id, value });
    setPreferences((current) => ({ ...current, [id]: value }));
  };
  const persistProfile = async (value: AppProfile) => {
    await saveAppProfile(value);
    setAppProfile(value);
  };

  const showToast = useCallback((value: string) => {
    setToast(value);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3_400);
  }, []);

  useEffect(() => {
    const updateInstalled = () => setIsInstalled(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const capturePrompt = () => setInstallPrompt(deferredInstallPrompt);
    const onInstalled = () => { deferredInstallPrompt = null; setIsInstalled(true); setInstallPrompt(null); showToast('App installed.'); };
    updateInstalled();
    window.addEventListener('app-install-prompt-ready', capturePrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('app-install-prompt-ready', capturePrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, [showToast]);

  const installApp = async (): Promise<boolean> => {
    if (isInstalled) { showToast('This app is already installed.'); return true; }
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    deferredInstallPrompt = null;
    setInstallPrompt(null);
    if (choice.outcome === 'accepted') setIsInstalled(true);
    return true;
  };

  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  useEffect(() => {
    if (!statuses.length) return;
    const nextExpiry = Math.min(...statuses.map((status) => Date.parse(status.expiresAt)));
    const timer = window.setTimeout(() => {
      void readAllData().then((result) => {
        setStatuses(result.statuses);
        if (activeStatus && !result.statuses.some((status) => status.id === activeStatus.id)) setActiveStatus(null);
      }).catch(() => undefined);
    }, Math.max(0, nextExpiry - Date.now()) + 25);
    return () => window.clearTimeout(timer);
  }, [statuses, activeStatus]);

  const activeContact = contacts.find((contact) => contact.id === activeContactId) ?? null;
  const activeMessages = activeContact ? messages.filter((message) => message.contactId === activeContact.id) : [];
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;

  const addContact = async (name: string, countryCode: string, phoneNumber: string, photoDataUrl: string | null = null) => {
    const now = new Date().toISOString();
    const contact: Contact = {
      id: makeId(),
      name,
      countryCode: countryCode.trim() ? (countryCode.trim().startsWith('+') ? countryCode.trim() : '+' + countryCode.trim()) : '',
      phoneNumber,
      avatarInfo: { kind: 'placeholder' },
      photoDataUrl,
      createdAt: now,
      lastModifiedAt: now,
      order: contacts.reduce((maximum, current) => Math.max(maximum, current.order), -1) + 1
    };
    await saveContact(contact);
    setContacts((current) => [...current, contact]);
    setSearch('');
    showToast('Contact added.');
  };

  const addMessage = async (contactId: string, text: string, direction: Direction, createdAt = new Date().toISOString(), historical = false, attachments?: MessageAttachment[]) => {
    const message: Message = {
      id: makeId(),
      contactId,
      text,
      direction,
      createdAt,
      localStatus: 'saved-locally-not-delivered',
      historical,
      ...(attachments?.length ? { attachments } : {})
    };
    setMessages((current) => sortMessages([...current, message]));
    try {
      await saveMessage(message);
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== message.id));
      showToast(error instanceof Error ? error.message : 'Message could not be saved.');
      throw error;
    }
  };

  const addAttachment = async (contactId: string, attachment: MessageAttachment) => addMessage(contactId, '', 'outgoing', new Date().toISOString(), false, [attachment]);

  const addStatus = async (ownerId: string, file: File, caption: string) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) throw new Error('Choose a photo or video.');
    const now = new Date(); const contact = contacts.find((item) => item.id === ownerId);
    const status: StatusUpdate = { id: makeId(), ownerId, ownerName: contact?.name ?? 'My status', mediaType: file.type.startsWith('video/') ? 'video' : 'image',
      mediaDataUrl: await fileToDataUrl(file, file.type.startsWith('image/') ? 1920 : 0), mimeType: file.type, fileName: file.name, size: file.size,
      caption: caption.trim(), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), viewed: ownerId === 'me' };
    await saveStatus(status); setStatuses((current) => [...current, status]); showToast('Status added.');
  };

  const markStatusViewed = useCallback((id: string) => {
    void updateStatusViewed(id);
    setStatuses((current) => current.map((item) => item.id === id ? { ...item, viewed: true } : item));
  }, []);

  const createGroup = async (name: string, memberIds: string[], photoDataUrl: string | null) => {
    const group: Group = { id: makeId(), name, memberIds, photoDataUrl, createdAt: new Date().toISOString(), order: groups.length };
    await saveGroup(group); setGroups((current) => [...current, group]); showToast('Group created.');
  };

  const saveGroupChanges = async (group: Group) => {
    await saveGroup(group);
    setGroups((current) => current.map((item) => item.id === group.id ? group : item));
    showToast('Group updated.');
  };
  const askDeleteGroup = (group: Group) => {
    setConfirm({ title: `Delete ${group.name}?`, message: 'This removes the group, its messages, and its community links from this device.', confirmLabel: 'Delete group', danger: true, onConfirm: async () => {
      await removeGroup(group.id);
      setGroups((current) => current.filter((item) => item.id !== group.id));
      setGroupMessages((current) => current.filter((item) => item.groupId !== group.id));
      setCommunities((current) => current.map((item) => ({ ...item, groupIds: item.groupIds.filter((id) => id !== group.id) })));
      setActiveGroupId(null); setScreen('home'); showToast('Group deleted.');
    } });
  };

  const createCommunity = async (name: string, groupIds: string[]) => {
    const community: Community = { id: makeId(), name, groupIds, createdAt: new Date().toISOString(), order: communities.length };
    await saveCommunity(community); setCommunities((current) => [...current, community]); showToast('Community created.');
  };

  const updateCommunityGroups = async (communityId: string, groupIds: string[]) => {
    const existing = communities.find((community) => community.id === communityId);
    if (!existing) return;
    const updated = { ...existing, groupIds };
    await saveCommunity(updated);
    setCommunities((current) => current.map((community) => community.id === communityId ? updated : community));
    showToast('Community groups updated.');
  };

  const addGroupMessage = async (groupId: string, text: string, direction: Direction = 'outgoing', senderContactId: string | null = null) => {
    const sender = contacts.find((item) => item.id === senderContactId);
    const message: GroupMessage = { id: makeId(), groupId, senderContactId, senderName: direction === 'outgoing' ? 'You' : sender?.name ?? 'Member', senderColor: sender ? `hsl(${(sender.order * 71 + 18) % 360} 70% 70%)` : '#8ed3a6', text, direction, createdAt: new Date().toISOString(), historical: false };
    setGroupMessages((current) => [...current, message].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)));
    try { await saveGroupMessage(message); }
    catch (error) { setGroupMessages((current) => current.filter((item) => item.id !== message.id)); throw error; }
  };

  const addCall = async (entry: Omit<CallRecord, 'id'>) => {
    const call: CallRecord = { ...entry, id: makeId() };
    await saveCall(call);
    setCalls((current) => [call, ...current].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    showToast('Call record saved.');
  };
  const deleteCall = async (id: string) => {
    await removeCall(id);
    setCalls((current) => current.filter((call) => call.id !== id));
    showToast('Call record removed.');
  };

  const askDeleteMessage = (message: Message) => {
    setConfirm({
      title: 'Delete this message?',
      message: 'This removes the message from this device. It cannot be restored unless you have a backup.',
      confirmLabel: 'Delete message',
      danger: true,
      onConfirm: async () => {
        await removeMessage(message.id);
        setMessages((current) => current.filter((item) => item.id !== message.id));
        showToast('Message deleted.');
      }
    });
  };

  const askDeleteContact = (contact: Contact) => {
    setConfirm({
      title: `Delete ${contact.name}?`,
      message: 'This removes the contact and all of its messages from this device.',
      confirmLabel: 'Delete contact',
      danger: true,
      onConfirm: async () => {
        await removeContactAndMessages(contact.id);
        setContacts((current) => current.filter((item) => item.id !== contact.id));
        setPreferences((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`contact:${contact.id}:`))));
        setMessages((current) => current.filter((item) => item.contactId !== contact.id));
        setStatuses((current) => current.filter((item) => item.ownerId !== contact.id));
        setCalls((current) => current.filter((call) => call.contactId !== contact.id));
        setGroups((current) => current.map((group) => ({ ...group, memberIds: group.memberIds.filter((id) => id !== contact.id) })));
        setActiveContactId(null);
        setScreen('home');
        showToast('Contact deleted.');
      }
    });
  };

  const exportData = () => {
    if (!contacts.length && !messages.length && !groups.length && !groupMessages.length && !communities.length && !statuses.length && !calls.length && !Object.keys(preferences).length && appProfile.name === 'You' && appProfile.about === 'Available' && !appProfile.phoneNumber && !appProfile.photoDataUrl) return;
    const backup = makeBackup({ contacts, messages, groups, groupMessages, communities, statuses, calls, appProfile, preferences: Object.entries(preferences).map(([id, value]) => ({ id, value })) });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'message-simulator-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Backup exported.');
  };

  const onChooseImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const backup = validateBackup(parsed);
      if (!contacts.length && !messages.length && !groups.length && !groupMessages.length && !communities.length && !statuses.length && !calls.length && !Object.keys(preferences).length) {
        await replaceLocalData(backup);
        await refreshData();
        setScreen('home');
        showToast('Backup restored.');
        return;
      }
      setConfirm({
        title: 'Replace saved data?',
        message: 'This backup will replace the contacts and messages currently saved in this browser.',
        confirmLabel: 'Replace and restore',
        onConfirm: async () => {
          await replaceLocalData(backup);
          await refreshData();
          setScreen('home');
          setActiveContactId(null);
          showToast('Backup restored.');
        }
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'That file could not be imported.');
    }
  };

  const resetData = () => {
    setConfirm({
      title: 'Clear this device’s app data?',
      message: 'This permanently deletes all saved contacts, messages, attachments, status updates, groups, and communities. Export a backup first if you may need them later.',
      confirmLabel: 'Clear data',
      danger: true,
      onConfirm: async () => {
        await clearLocalData();
        setContacts([]);
        setMessages([]);
        setGroups([]); setGroupMessages([]); setCommunities([]); setStatuses([]); setCalls([]);
        setPreferences({}); setAppProfile({ name: 'You', about: 'Available', phoneNumber: '', photoDataUrl: null });
        setActiveContactId(null);
        setScreen('home');
        showToast('App data cleared.');
      }
    });
  };

  const saveContactChanges = async (contact: Contact) => {
    await saveContact(contact);
    setContacts((current) => current.map((item) => item.id === contact.id ? contact : item));
    const renamed = statuses.filter((item) => item.ownerId === contact.id && item.ownerName !== contact.name);
    await Promise.all(renamed.map((item) => saveStatus({ ...item, ownerName: contact.name })));
    if (renamed.length) setStatuses((current) => current.map((item) => item.ownerId === contact.id ? { ...item, ownerName: contact.name } : item));
  };

  const saveEntry = async (text: string, direction: Direction, createdAt: string, historical: boolean) => {
    if (!activeContactId) return;
    await addMessage(activeContactId, text, direction, createdAt, historical);
    showToast('Message added.');
  };

  const body = !ready ? (
    <div className="loading-view"><span className="loading-mark"><MessageCircle size={21} /></span><span>Opening chats…</span></div>
  ) : storageError ? (
    <div className="storage-error"><Info size={23} /><h1>Saved data unavailable</h1><p>{storageError} Try reopening this app in Safari or another modern browser.</p></div>
  ) : screen === 'conversation' && activeContact ? (
    <ConversationScreen
      contact={activeContact}
      messages={activeMessages}
      onBack={() => setScreen('home')}
      onInfo={() => setScreen('contact')}
      onDelete={askDeleteMessage}
      onDeleteContact={() => askDeleteContact(activeContact)}
      onSend={(text) => addMessage(activeContact.id, text, 'outgoing')}
      onSendAttachment={(attachment) => addAttachment(activeContact.id, attachment)}
      onNewEntry={(direction, currentTime) => setEntryRequest({ direction, currentTime })}
      isMuted={Boolean(preferences[`contact:${activeContact.id}:muted`] ?? false)}
      onToggleMute={() => void persistPreference(`contact:${activeContact.id}:muted`, !Boolean(preferences[`contact:${activeContact.id}:muted`] ?? false))}
      onToast={showToast}
    />
  ) : screen === 'contact' && activeContact ? (
    <ContactScreen
      contact={activeContact}
      messages={activeMessages}
      isMuted={Boolean(preferences[`contact:${activeContact.id}:muted`] ?? false)}
      onBack={() => setScreen('conversation')}
      onSave={saveContactChanges}
      onDelete={() => askDeleteContact(activeContact)}
      onToggleMute={() => void persistPreference(`contact:${activeContact.id}:muted`, !Boolean(preferences[`contact:${activeContact.id}:muted`] ?? false))}
      onToast={showToast}
    />
  ) : screen === 'profile' ? (
    <ProfileScreen hasData={contacts.length > 0 || messages.length > 0 || groups.length > 0 || groupMessages.length > 0 || communities.length > 0 || statuses.length > 0 || calls.length > 0 || Object.keys(preferences).length > 0 || appProfile.name !== 'You' || appProfile.about !== 'Available' || !!appProfile.photoDataUrl || !!appProfile.phoneNumber} profile={appProfile} preferences={preferences} onSaveProfile={persistProfile} onSavePreference={persistPreference} onHome={() => setScreen('home')} onUpdates={() => setScreen('updates')} onCalls={() => setScreen('calls')} onCommunities={() => setScreen('communities')} onExport={exportData} onImport={() => importRef.current?.click()} onReset={resetData} onToast={showToast} isInstalled={isInstalled} onInstallApp={installApp} />
  ) : screen === 'updates' ? (
    <UpdatesScreen contacts={contacts} statuses={statuses} onAddStatus={addStatus} onOpenStatus={(status) => { setActiveStatus(status); }} onHome={() => setScreen('home')} onCalls={() => setScreen('calls')} onCommunities={() => setScreen('communities')} onProfile={() => setScreen('profile')} />
  ) : screen === 'calls' ? (
    <CallsScreen contacts={contacts} calls={calls} onAdd={addCall} onDelete={(id) => void deleteCall(id)} onHome={() => setScreen('home')} onProfile={() => setScreen('profile')} onUpdates={() => setScreen('updates')} onCommunities={() => setScreen('communities')} />
  ) : screen === 'communities' ? (
    <CommunitiesScreen contacts={contacts} groups={groups} communities={communities} onCreateGroup={createGroup} onCreateCommunity={createCommunity} onUpdateCommunityGroups={updateCommunityGroups} onOpenGroup={(id) => { setActiveGroupId(id); setScreen('group-conversation'); }} onHome={() => setScreen('home')} onUpdates={() => setScreen('updates')} onCalls={() => setScreen('calls')} onProfile={() => setScreen('profile')} />
  ) : screen === 'group-conversation' && activeGroup ? (
    <GroupConversationScreen group={activeGroup} contacts={contacts} messages={groupMessages.filter((message) => message.groupId === activeGroup.id)} onBack={() => setScreen('home')} onSend={(text) => addGroupMessage(activeGroup.id, text)} onReceive={(text, senderId) => addGroupMessage(activeGroup.id, text, 'incoming', senderId)} onSaveGroup={saveGroupChanges} onDeleteGroup={() => askDeleteGroup(activeGroup)} />
  ) : (
    <HomeScreen
      contacts={contacts}
      messages={messages}
      groups={groups}
      groupMessages={groupMessages}
      search={search}
      setSearch={setSearch}
      onOpenContact={(id) => { setActiveContactId(id); setScreen('conversation'); }}
      onOpenGroup={(id) => { setActiveGroupId(id); setScreen('group-conversation'); }}
      onProfile={() => setScreen('profile')}
      onUpdates={() => setScreen('updates')}
      onCalls={() => setScreen('calls')}
      onCommunities={() => setScreen('communities')}
      onAddContact={() => setAddContactOpen(true)}
      onToast={showToast}
    />
  );

  return (
    <main className="app-root">
      {body}
      {activeStatus && <StatusViewer status={activeStatus} allStatuses={statuses} onClose={() => setActiveStatus(null)} onSelect={setActiveStatus} onViewed={markStatusViewed} />}
      <input ref={importRef} type="file" accept=".json,application/json" className="visually-hidden" aria-label="Choose a backup file" onChange={(event) => void onChooseImport(event)} />
      {toast && <div className="toast-message" role="status" aria-live="polite">{toast}</div>}
      {addContactOpen && <AddContactDialog onClose={() => setAddContactOpen(false)} onAdd={addContact} />}
      {entryRequest && <MessageEntryDialog initialDirection={entryRequest.direction} useCurrentTime={entryRequest.currentTime} onClose={() => setEntryRequest(null)} onSave={saveEntry} />}
      {confirm && (
        <Dialog title={confirm.title} onClose={() => setConfirm(null)} compact>
          <div className="confirm-copy"><p>{confirm.message}</p></div>
          <div className="form-actions">
            <button type="button" className="secondary-action" onClick={() => setConfirm(null)}>Cancel</button>
            <button type="button" className={confirm.danger ? 'danger-action' : 'primary-action'} onClick={() => {
              const action = confirm.onConfirm;
              setConfirm(null);
              void action().catch((error: unknown) => showToast(error instanceof Error ? error.message : 'This action could not be completed.'));
            }}>{confirm.confirmLabel}</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}

export default App;


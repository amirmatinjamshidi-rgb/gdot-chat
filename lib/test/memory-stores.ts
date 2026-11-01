import type { PreKey, SignedPreKey, SessionRecord } from "@/lib/crypto/types";
import type { ICryptoKeyStore } from "@/lib/db/crypto-key-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { ISessionStore } from "@/lib/db/session-store";
import type { LocalIdentity, RemoteIdentity } from "@/lib/db/types";

export class MemoryIdentityStore implements IIdentityStore {
  local: LocalIdentity | null = null;
  remotes = new Map<string, RemoteIdentity>();

  async getLocalIdentity(): Promise<LocalIdentity | null> {
    return this.local;
  }

  async saveLocalIdentity(identity: LocalIdentity): Promise<void> {
    this.local = { ...identity };
  }

  async getRemoteIdentity(peerAddressId: string): Promise<RemoteIdentity | null> {
    return this.remotes.get(peerAddressId) ?? null;
  }

  async saveRemoteIdentity(identity: RemoteIdentity): Promise<void> {
    this.remotes.set(identity.peerDeviceId, { ...identity });
  }

  async setVerified(peerAddressId: string, verified: boolean): Promise<void> {
    const r = this.remotes.get(peerAddressId);
    if (r) this.remotes.set(peerAddressId, { ...r, verified });
  }

  async setKeyChanged(peerAddressId: string, keyChanged: boolean): Promise<void> {
    const r = this.remotes.get(peerAddressId);
    if (r) this.remotes.set(peerAddressId, { ...r, keyChanged });
  }
}

export class MemorySessionStore implements ISessionStore {
  private map = new Map<string, SessionRecord>();

  async get(peerDeviceId: string): Promise<SessionRecord | null> {
    const v = this.map.get(peerDeviceId);
    return v ? { peerDeviceId: v.peerDeviceId, serialized: new Uint8Array(v.serialized) } : null;
  }

  async save(peerDeviceId: string, record: SessionRecord): Promise<void> {
    this.map.set(peerDeviceId, {
      peerDeviceId,
      serialized: new Uint8Array(record.serialized),
    });
  }

  async delete(peerDeviceId: string): Promise<void> {
    this.map.delete(peerDeviceId);
  }
}

export class MemoryCryptoKeyStore implements ICryptoKeyStore {
  identityPrivate: Uint8Array | null = null;
  signed = new Map<number, SignedPreKey>();
  oneTime = new Map<number, PreKey & { consumed?: boolean }>();
  nextOtk = 1;

  async getIdentityPrivateKey(): Promise<Uint8Array | null> {
    return this.identityPrivate ? new Uint8Array(this.identityPrivate) : null;
  }

  async saveIdentityPrivateKey(privateKey: Uint8Array): Promise<void> {
    this.identityPrivate = new Uint8Array(privateKey);
  }

  async getSignedPreKey(keyId: number): Promise<SignedPreKey | null> {
    const k = this.signed.get(keyId);
    return k
      ? {
          keyId: k.keyId,
          publicKey: new Uint8Array(k.publicKey),
          privateKey: new Uint8Array(k.privateKey),
          signature: new Uint8Array(k.signature),
        }
      : null;
  }

  async saveSignedPreKey(key: SignedPreKey): Promise<void> {
    this.signed.set(key.keyId, {
      keyId: key.keyId,
      publicKey: new Uint8Array(key.publicKey),
      privateKey: new Uint8Array(key.privateKey),
      signature: new Uint8Array(key.signature),
    });
  }

  async getOneTimePreKey(keyId: number): Promise<PreKey | null> {
    const k = this.oneTime.get(keyId);
    if (!k || k.consumed) return null;
    if (k.privateKey.length === 0) return null;
    return {
      keyId: k.keyId,
      publicKey: new Uint8Array(k.publicKey),
      privateKey: new Uint8Array(k.privateKey),
    };
  }

  async saveOneTimePreKeys(keys: PreKey[]): Promise<void> {
    for (const k of keys) {
      this.oneTime.set(k.keyId, {
        keyId: k.keyId,
        publicKey: new Uint8Array(k.publicKey),
        privateKey: new Uint8Array(k.privateKey),
        consumed: false,
      });
    }
  }

  async removeOneTimePreKey(keyId: number): Promise<void> {
    const k = this.oneTime.get(keyId);
    if (!k) return;
    this.oneTime.set(keyId, {
      ...k,
      privateKey: new Uint8Array(0),
      consumed: true,
    });
  }

  async getNextOtkKeyId(): Promise<number> {
    return this.nextOtk;
  }

  async setNextOtkKeyId(nextId: number): Promise<void> {
    this.nextOtk = nextId;
  }

  async getNextSignedPreKeyId(): Promise<number> {
    let max = 0;
    for (const id of this.signed.keys()) max = Math.max(max, id);
    return max + 1;
  }
}

import type { IConversationStore } from "@/lib/db/conversation-store";
import type { IMessageStore } from "@/lib/db/message-store";
import type { IReactionStore, ReactionApplyOp } from "@/lib/db/reaction-store";
import type { Conversation, LocalMessage, MessageStatus } from "@/lib/db/types";
import type { Reaction } from "@/components/reactions/types";

export class MemoryMessageStore implements IMessageStore {
  messages = new Map<string, LocalMessage>();

  async insert(message: LocalMessage): Promise<void> {
    this.messages.set(message.id, { ...message });
  }

  async listByConversation(
    conversationId: string,
    limit: number,
    before?: number,
  ): Promise<LocalMessage[]> {
    return [...this.messages.values()]
      .filter(
        (m) =>
          m.conversationId === conversationId &&
          (before == null || m.createdAt < before),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async updateStatus(id: string, status: MessageStatus): Promise<void> {
    const m = this.messages.get(id);
    if (m) this.messages.set(id, { ...m, status });
  }

  async updateServerEnvelopeId(id: string, serverEnvelopeId: string): Promise<void> {
    const m = this.messages.get(id);
    if (m) this.messages.set(id, { ...m, serverEnvelopeId });
  }

  async updateAttachmentId(id: string, attachmentId: string): Promise<void> {
    const m = this.messages.get(id);
    if (m) this.messages.set(id, { ...m, attachmentId });
  }

  async getById(id: string): Promise<LocalMessage | null> {
    return this.messages.get(id) ?? null;
  }

  async getByClientId(clientId: string): Promise<LocalMessage | null> {
    return [...this.messages.values()].find((m) => m.clientId === clientId) ?? null;
  }

  async getByServerEnvelopeId(
    serverEnvelopeId: string,
  ): Promise<LocalMessage | null> {
    return (
      [...this.messages.values()].find(
        (m) => m.serverEnvelopeId === serverEnvelopeId,
      ) ?? null
    );
  }
}

export class MemoryConversationStore implements IConversationStore {
  conversations = new Map<string, Conversation>();

  async upsert(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, { ...conversation });
  }

  async listAll(): Promise<Conversation[]> {
    return [...this.conversations.values()].map((c) => ({ ...c }));
  }

  async getByPeer(peerUserId: string): Promise<Conversation | null> {
    return (
      [...this.conversations.values()].find((c) => c.peerUserId === peerUserId) ??
      null
    );
  }

  async getById(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) ?? null;
  }
}

export class MemoryReactionStore implements IReactionStore {
  private rows: { messageId: string; emoji: string; userId: string }[] = [];

  async toggle(messageId: string, emoji: string, userId: string): Promise<Reaction[]> {
    return this.apply(messageId, emoji, userId, "toggle");
  }

  async apply(
    messageId: string,
    emoji: string,
    userId: string,
    op: ReactionApplyOp,
  ): Promise<Reaction[]> {
    const has = this.rows.some(
      (r) => r.messageId === messageId && r.emoji === emoji && r.userId === userId,
    );
    if (op === "add" || (op === "toggle" && !has)) {
      if (!has) this.rows.push({ messageId, emoji, userId });
    } else if (op === "remove" || (op === "toggle" && has)) {
      this.rows = this.rows.filter(
        (r) =>
          !(r.messageId === messageId && r.emoji === emoji && r.userId === userId),
      );
    }
    return this.listForMessage(messageId);
  }

  async listForMessage(messageId: string): Promise<Reaction[]> {
    const byEmoji = new Map<string, string[]>();
    for (const r of this.rows.filter((x) => x.messageId === messageId)) {
      const users = byEmoji.get(r.emoji) ?? [];
      users.push(r.userId);
      byEmoji.set(r.emoji, users);
    }
    return [...byEmoji.entries()].map(([emoji, users]) => ({ emoji, users, count: users.length }));
  }

  async listForConversation(
    _conversationId: string,
  ): Promise<Map<string, Reaction[]>> {
    return new Map();
  }

  async userHasReaction(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<boolean> {
    return this.rows.some(
      (r) => r.messageId === messageId && r.emoji === emoji && r.userId === userId,
    );
  }
}

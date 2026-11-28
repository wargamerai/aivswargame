// Firestore transport. One room snapshot + one guest inbox; no polling/server process.
(function (root) {
  'use strict';
  const CODE = /^[1-9][0-9]{7}$/;
  const LANG = ['ja', 'en', 'fr', 'de', 'it', 'es', 'zh', 'ko', 'ru'];
  const NS = 'dokusoRoomsV1';
  class RoomClient {
    constructor({ db, uid, D, md, images, core, clock = Date.now, onView = () => {}, onStatus = () => {} }) {
      Object.assign(this, { db, uid, D, md, images, core, clock, onView, onStatus });
      this.unsub = []; this.data = null; this.processing = false; this.busy = false;
      this.waiters = new Map(); this.generation = 0;
      this.revisionWaiters = new Set();
    }
    refs(code) {
      const ref = this.db.collection(NS).doc(code);
      return { ref, secret: ref.collection('private').doc('state'), inbox: ref.collection('input').doc('guest') };
    }
    async create(language, Timestamp) {
      if (!LANG.includes(language)) throw new Error('language');
      if (this.code) throw new Error('activeRoom');
      const entropy = new Uint32Array(2); crypto.getRandomValues(entropy);
      const room = this.core.create(this.D, this.md, this.images, entropy[0]);
      for (let attempt = 0; attempt < 5; attempt++) {
        crypto.getRandomValues(entropy);
        const code = String(10000000 + entropy[1] % 90000000), refs = this.refs(code);
        const data = { version: 1, host: this.uid, guest: null, language, rev: 0,
          actor: 'sov', public: this.core.pack(room, true), ack: null, closed: false,
          createdAt: Timestamp.fromMillis(this.clock()), expiresAt: Timestamp.fromMillis(this.clock() + 48 * 3600000) };
        const made = await this.db.runTransaction(async tx => {
          if ((await tx.get(refs.ref)).exists) return false;
          tx.set(refs.ref, data);
          tx.set(refs.secret, { state: this.core.pack(room, false) });
          return true;
        });
        if (made) { this.attach(code, 'sov'); return code; }
      }
      throw new Error('busy');
    }
    async join(code, language) {
      code = String(code).trim();
      if (!CODE.test(code)) throw new Error('code');
      if (this.code) throw new Error('activeRoom');
      const { ref } = this.refs(code);
      const seat = await this.db.runTransaction(async tx => {
        const snap = await tx.get(ref), data = snap.data();
        if (!snap.exists || data.closed || data.expiresAt.toMillis() <= this.clock()) throw new Error('noRoom');
        if (data.version !== 1) throw new Error('version');
        if (data.language !== language) throw new Error('language');
        if (data.host === this.uid) return 'sov';
        if (data.guest === this.uid) return 'ger';
        if (data.guest) throw new Error('full');
        tx.update(ref, { guest: this.uid });
        return 'ger';
      }).catch(async error => {
        // A concurrent join can be rejected by rules before the SDK retries it.
        if (error.code === 'permission-denied') {
          let snapshot;
          try { snapshot = await ref.get({ source: 'server' }); }
          catch { throw new Error('noRoom'); }
          const current = snapshot.data();
          if (!snapshot.exists || current.closed || current.expiresAt.toMillis() <= this.clock()) throw new Error('noRoom');
          if (current.guest && current.guest !== this.uid && current.host !== this.uid) throw new Error('full');
        }
        throw error;
      });
      this.attach(code, seat);
      return seat;
    }
    attach(code, seat) {
      this.detach();
      this.code = code; this.seat = seat;
      Object.assign(this, this.refs(code));
      const generation = this.generation;
      const fail = e => { if (generation === this.generation) this.onStatus('error', e); };
      this.unsub.push(this.ref.onSnapshot({ includeMetadataChanges: true }, snap => {
        if (generation !== this.generation) return;
        if (!snap.exists) { this.onStatus('closed'); return; }
        const data = snap.data();
        this.online = !snap.metadata.fromCache && !snap.metadata.hasPendingWrites;
        this.data = data;
        if (data.closed || data.expiresAt.toMillis() <= this.clock()) { this.onStatus('closed'); return; }
        this.onStatus(this.online ? (data.guest ? 'connected' : 'waiting') : 'offline');
        try { this.onView(data, this.seat); }
        catch (error) { this.online = false; this.onStatus('error', error); return; }
        if (this.online) for (const waiter of this.revisionWaiters) {
          if (data.rev >= waiter.rev) { this.revisionWaiters.delete(waiter); waiter.resolve(); }
        }
        if (data.ack && this.waiters.has(data.ack.id)) {
          const { resolve, reject } = this.waiters.get(data.ack.id);
          this.waiters.delete(data.ack.id);
          if (data.ack.ok) resolve(); else reject(new Error(data.ack.error || 'illegal'));
        }
        if (this.seat === 'sov') void this.drain().catch(fail);
      }, fail));
      if (seat === 'sov') this.unsub.push(this.inbox.onSnapshot(snap => {
        if (generation !== this.generation) return;
        this.request = snap.exists ? snap.data() : null;
        void this.drain().catch(fail);
      }, fail));
    }
    async drain() {
      if (this.processing || !this.online || !this.data?.guest || !this.request || this.data.ack?.id === this.request.id) return;
      this.processing = true;
      const request = this.request;
      try {
        await this.commit(request, 'ger');
        // Wait for the acknowledged room snapshot rather than reapplying a request.
      } finally {
        this.processing = false;
        // A second inbox event can arrive while a transaction is completing.
        if (this.request && this.request.id !== request.id) void this.drain().catch(e => this.onStatus('error', e));
      }
    }
    async commit(command, seat) {
      const { core, D, md, images } = this;
      const { ref, secret, inbox, generation } = this;
      return this.db.runTransaction(async tx => {
        if (generation !== this.generation) throw new Error('disconnected');
        const [r, p, input] = await Promise.all([tx.get(ref), tx.get(secret), tx.get(inbox)]);
        const data = r.data();
        if (!r.exists || !p.exists || data.closed || data.expiresAt.toMillis() <= this.clock()) throw new Error('noRoom');
        if (data.host !== this.uid || !data.guest) throw new Error('outOfTurn');
        if (seat === 'ger' && (input.data()?.id !== command.id || data.ack?.id === command.id)) return;
        const room = core.unpack(D, md, images, p.data().state);
        let args;
        try { args = JSON.parse(command.args); } catch { args = null; }
        const valid = data.rev === command.rev && core.perform(room, D, seat, command.name, args);
        if (!valid) {
          if (seat === 'sov') throw new Error(data.rev !== command.rev ? 'stale' : 'illegal');
          tx.update(ref, { ack: { id: command.id, ok: false, error: data.rev !== command.rev ? 'stale' : 'illegal' } });
          return;
        }
        const state = core.pack(room, false), view = core.pack(room, true);
        if (new TextEncoder().encode(state).length > 850000 || new TextEncoder().encode(view).length > 850000) throw new Error('size');
        tx.update(ref, { rev: data.rev + 1, public: view, actor: core.actor(room.game),
          ...(seat === 'ger' ? { ack: { id: command.id, ok: true } } : {}) });
        tx.set(secret, { state });
        return data.rev + 1;
      });
    }
    async waitForRevision(rev) {
      if (this.online && this.data?.rev >= rev) return;
      let waiter, timer;
      try {
        await new Promise((resolve, reject) => {
          waiter = { rev, resolve, reject };
          this.revisionWaiters.add(waiter);
          timer = setTimeout(() => reject(new Error('timeout')), 30000);
        });
      } finally { clearTimeout(timer); this.revisionWaiters.delete(waiter); }
    }
    async send(name, args = []) {
      if (this.busy || !this.online || !this.data?.guest || this.data.closed || this.data.actor !== this.seat) throw new Error('outOfTurn');
      this.busy = true;
      try {
        const nonce = new Uint32Array(4); crypto.getRandomValues(nonce);
        const id = Array.from(nonce, n => n.toString(16).padStart(8, '0')).join('');
        const command = { id, rev: this.data.rev, name, args: JSON.stringify(args) };
        if (this.seat === 'sov') {
          const rev = await this.commit(command, 'sov');
          await this.waitForRevision(rev);
          return;
        }
        let timer;
        const ack = new Promise((resolve, reject) => {
          timer = setTimeout(() => { this.waiters.delete(id); reject(new Error('timeout')); }, 30000);
          this.waiters.set(id, { resolve, reject });
        });
        // Register before writing: an active host may acknowledge immediately.
        try { await Promise.all([this.inbox.set(command), ack]); }
        finally { clearTimeout(timer); this.waiters.delete(id); }
      } finally { this.busy = false; }
    }
    async close() {
      if (this.seat !== 'sov') throw new Error('outOfTurn');
      const batch = this.db.batch();
      batch.delete(this.secret); batch.delete(this.inbox);
      batch.update(this.ref, { closed: true, public: '' });
      await batch.commit();
      this.detach();
    }
    detach() {
      this.generation++;
      this.unsub.splice(0).forEach(fn => fn());
      for (const w of this.waiters.values()) w.reject(new Error('disconnected'));
      this.waiters.clear();
      for (const waiter of this.revisionWaiters) waiter.reject(new Error('disconnected'));
      this.revisionWaiters.clear();
      this.code = null; this.data = null; this.request = null; this.online = false;
    }
  }
  const api = { RoomClient, CODE, LANG, NS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DOKUSO_ROOM = api;
})(typeof window !== 'undefined' ? window : globalThis);

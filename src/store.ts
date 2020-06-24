import { Observer, SubscribableOrPromise, Observable } from "rxjs";

export interface Status<T> {
  known: boolean;
  loading: boolean;
  live: boolean;
  error?: Error;
  value: T | null;
}

const DEFAULT_STATUS = { known: false, loading: false, live: false };

export interface getter<T, U> {
  (state: Partial<T>): U;
}

export class Store<T> {
  private currentState: Partial<T>;
  private statusMap: { [k in keyof T]?: Status<any> } = {};
  private unsubs: { [k in keyof T]?: () => void } = {};
  private getters: { [k in keyof T]?: getter<T, any> } = {};
  private notifs: { [k in keyof T]?: Set<keyof T> } = {};
  private subs: { [k in keyof T]?: Set<(val: T[k] | null) => any> } = {};
  private statusSubs: {
    [k in keyof T]?: Set<(val: Status<T[k]>) => any>;
  } = {};
  private globalSubs: Set<(state: Partial<T>) => any> = new Set<
    (state: Partial<T>) => any
  >();

  constructor(initialState: Partial<T> = {}) {
    this.currentState = initialState;
  }

  getStatus<K extends keyof T>(key: K): Status<T[K]> {
    return {
      ...(this.statusMap[key] || DEFAULT_STATUS),
      value: this.get(key),
    };
  }

  get<K extends keyof T>(key: K): T[K] | null {
    if (this.getters[key]) {
      return this.getters[key]!(this.currentState) || null;
    }

    return this.currentState[key]! || null;
  }

  async set<K extends keyof T>(
    key: K,
    val: T[K] | SubscribableOrPromise<T[K]>
  ): Promise<void> {
    if (this.getters[key]) {
      delete this.getters[key];
    }
    // handle setting over existing observables, promises in flight, etc

    if ("then" in val && typeof val.then === "function") {
      this.statusMap[key] = {
        known: true,
        loading: true,
        live: false,
        value: null,
      };
      // notifystatus
      try {
        this.currentState = { ...this.currentState, [key]: await val };
        // notifyvalue
      } catch (e) {
        this.statusMap[key] = {
          known: true,
          loading: false,
          live: false,
          error: e,
          value: null,
        };
        // notifystatus
      }
      return;
    } else if ("subscribe" in val && typeof val.subscribe === "function") {
      if (this.unsubs[key]) this.unsubs[key]!();
      this.unsubs[key] = val.subscribe(this.observer(key)).unsubscribe;
    }

    this.statusMap[key] = {
      known: true,
      loading: false,
      live: false,
      value: val,
    };
    this.currentState = { ...this.currentState, [key]: await val };
  }

  getter<K extends keyof T>(
    key: K,
    getter: getter<T, T[K]>,
    depends: K[] = []
  ): void {
    this.statusMap[key] = {
      loading: false,
      live: false,
      known: true,
      value: null,
    };
    this.getters[key] = () => getter(this.currentState);
    depends.forEach((d) => {
      this.notifs[d] = this.notifs[d] || new Set<keyof T>();
      this.notifs[d]!.add(key);
    });
  }

  observer<K extends keyof T>(key: K): Observer<T[K]> {
    this.statusMap[key] = {
      known: true,
      live: true,
      loading: true,
      value: null,
    };
    let firstLoad = true;
    return {
      next: (v) => {
        if (firstLoad) {
          firstLoad = false;
          this.statusMap[key] = { ...this.statusMap[key], loading: false };
        }
        this.currentState[key] = v;
        this.notifyValue(key);
        this.notifyStatus(key);
      },
      error: (e) => {
        this.statusMap[key] = {
          ...this.statusMap[key],
          loading: false,
          error: e,
        };
        this.notifyStatus(key);
      },
      complete: () => {
        this.statusMap[key] = {
          ...this.statusMap[key],
          loading: false,
          live: false,
        };
        this.notifyStatus(key);
      },
    };
  }

  notifyList(key: keyof T): Set<keyof T> {
    const toCheck = this.notifs[key] ? this.notifs[key]! : [];
    return new Set([key, ...toCheck]);
  }

  notifyStatus<K extends keyof T>(key: K): void {
    console.log(this.notifyList(key));
    this.notifyList(key).forEach((k) => {
      if (this.statusSubs[k]) {
        this.statusSubs[k]!.forEach((sub) => sub(this.getStatus(k)));
      }
    });
  }

  notifyValue<K extends keyof T>(key: K): void {
    this.notifyList(key).forEach((k) => {
      if (this.subs[k]) {
        this.subs[k]!.forEach((sub) => sub(this.get(k)));
      }
    });

    this.globalSubs.forEach((sub) => sub(this.getState()));
  }

  subscribe(sub: (state: Partial<T>) => any) {
    this.globalSubs.add(sub);
  }

  getState(): Partial<T> {
    const out: Partial<T> = { ...this.currentState };
    for (const k in this.getters) {
      out[k] = this.getters[k]!(this.currentState);
    }
    return out;
  }

  watch<K extends keyof T>(key: K, sub: (value: T[K] | null) => any): void {
    this.subs[key] = this.subs[key] || new Set();
    this.subs[key]!.add(sub);
  }

  watchStatus<K extends keyof T>(
    key: K,
    sub: (value: Status<T[K]>) => any
  ): void {
    this.statusSubs[key] = this.statusSubs[key] || new Set();
    this.statusSubs[key]!.add(sub);
  }

  observe<K extends keyof T>(key: K): Observable<Status<T[K]>> {
    return new Observable((subscribe) => {
      this.watchStatus(key, (status) => {
        if (status.error) {
          subscribe.error(status.error);
        } else {
          subscribe.next(status);
        }
      });
    });
  }
}

/*
  get<K extends keyof T>(key: K): T[K] | null {
    if (typeof this.state[key] === "undefined") return null;
    return this.state[key]!;
  }

  async set<K extends keyof T>(key: K, val: T[K] | Promise<T[K]>): Promise<T> {
    if ("then" in val && typeof val.then === "function") {
      this.statusMap[key] = { known: true, loading: true, live: false };
      this.notifyStatus(key);
      try {
        this.currentState = { ...this.state, [key]: await val };
        this.statusMap[key] = { known: true, loading: false, live: false };
        this.notify(key);
      } catch (e) {
        this.statusMap[key] = {
          known: true,
          loading: false,
          live: false,
          error: e,
        };
      }
    }
    return this.state;
  }

  private notify<K extends keyof T>(key: K): void {
    this.notifyStatus(key);
    this.notifyValue(key);
  }

  private notifyStatus<K extends keyof T>(key: K): void {
    (this.statusListens[key]! || []).forEach((l) => {
      l(this.status(key));
    });
  }

  private notifyValue<K extends keyof T>(key: K): void {
    (this.valueListens[key]! || []).forEach((l) => {
      l(this.get(key), this.status(key));
    });
  }

  status(key: keyof T): Status {
    return this.statusMap[key] ? this.statusMap[key]! : { ...DEFAULT_STATUS };
  }

  get state(): Readonly<T> {
    return { ...(this.currentState as Readonly<T>) };
  }

  subscribe<K extends keyof T>(keys: K | K[], fn: (val: Partial<T>, )): Pick<T, K> {
    if (typeof keys === 'string') {
      keys = [keys];
    }

    this.valueListens[key] = this.valueListens[key] || [];
    this.valueListens[key].push();
  }
}
*/

export interface Status<T> {
  known: boolean;
  loading: boolean;
  live: boolean;
  error?: Error;
  value: T | null;
}

const DEFAULT_STATUS = { known: false, loading: false, live: false };

export interface ObserverLike<T> {
  closed?: boolean;
  next: (value: T) => void;
  error: (err: any) => void;
  complete: () => void;
}

export interface Getter<T, U> {
  (state: Partial<T>): U;
}

interface StoreContext<T> {
  known: Set<keyof T>;
  loading: { [k in keyof T]?: boolean };
  errors: { [k in keyof T]?: Error };
  live: { [k in keyof T]?: boolean };
}

type Subscription<T> = (state: Partial<T>, context: StoreContext<T>) => any;
type Unsubscribe = () => void;

export interface Store<T = any> {
  state: Partial<T>;
  subscriptions: Set<Subscription<T>>;
  knowns: Set<keyof T>;
  lives: { [k in keyof T]?: boolean };
  loadings: { [k in keyof T]?: boolean };
  disconnects: { [k in keyof T]?: Unsubscribe };
  errors: { [k in keyof T]?: Error };
  notifyScheduled: boolean;
}

export function createStore<T = any>(initialState: Partial<T>): Store<T> {
  const store = {
    state: {},
    subscriptions: new Set<Subscription<T>>(),
    knowns: new Set<keyof T>(),
    lives: {},
    loadings: {},
    disconnects: {},
    errors: {},
    notifyScheduled: false,
  };

  setState<T>(store, initialState);
  return store;
}

export function getState<T = any>(store: Store<T>): Partial<T> {
  return store.state;
}

export function getContext<T = any>(store: Store): StoreContext<T> {
  return {
    loading: store.loadings,
    known: store.knowns as Set<keyof T>,
    errors: store.errors,
    live: store.lives,
  };
}

export function setState<T = any>(store: Store<T>, merge: Partial<T>): void {
  Object.keys(merge).forEach((k) => {
    const key = k as keyof T;
    store.knowns.add(key);
    store.errors[key] = undefined;
    store.loadings[key] = false;
    store.lives[key] = false;
    if (store.disconnects[key]) {
      store.disconnects[key]!();
      delete store.disconnects[key];
    }
  });
  store.state = { ...store.state, ...merge };
  scheduleNotify(store);
}

export async function set<K extends keyof T, T = any>(
  store: Store<T>,
  key: K,
  value: T[K] | Promise<T[K]>
): Promise<void> {
  store.knowns.add(key);
  store.state = { ...store.state, [key]: undefined };
  delete store.errors[key];
  store.loadings[key] = true;
  store.lives[key] = false;
  scheduleNotify(store);

  try {
    store.state = { ...store.state, [key]: await Promise.resolve(value) };
  } catch (e) {
    store.state = { ...store.state, [key]: undefined };
    store.errors[key] = e;
  }

  store.loadings[key] = false;
  scheduleNotify(store);
}

export function observer<K extends keyof T, T = any>(
  store: Store<T>,
  key: K,
  options: {
    transform?: (val: any) => T[K];
  } = {}
): ObserverLike<T[K]> {
  store.loadings[key] = true;
  store.lives[key] = true;

  const observer = {
    closed: false,
    next: (val: any) => {
      if (observer.closed) {
        return;
      }

      let finalVal = val;
      if (options.transform) {
        try {
          finalVal = options.transform(val);
        } catch (err) {
          observer.error(err);
          return;
        }
      }

      store.loadings[key] = false;
      store.state = {
        ...store.state,
        [key]: options.transform ? options.transform(val) : val,
      };
      scheduleNotify(store);
    },
    error: (err: Error) => {
      if (observer.closed) {
        return;
      }

      observer.closed = true;
      store.loadings[key] = false;
      store.state = { ...store.state, [key]: undefined };
      store.errors[key] = err;
      store.lives[key] = false;
      scheduleNotify(store);
    },
    complete: () => {
      if (observer.closed) {
        return;
      }

      observer.closed = true;
      store.loadings[key] = false;
      store.lives[key] = false;
      scheduleNotify(store);
    },
  };

  return observer;
}

export function get<K extends keyof T, T = any>(
  store: Store<T>,
  key: K
): T[K] | undefined {
  return store.state[key];
}

export function unset<T = any>(store: Store<T>, ...keys: (keyof T)[]): void {
  keys.forEach((key) => {
    store.knowns.delete(key);
    store.state = { ...store.state };
    if (store.disconnects[key]) {
      store.disconnects[key]!();
      delete store.disconnects[key];
    }
    delete store.errors[key];
    delete store.loadings[key];
    delete store.state[key];
  });
  scheduleNotify(store);
}

export function subscribe<T = any>(
  store: Store<T>,
  sub: Subscription<T>,
  immediate = false
): Unsubscribe {
  store.subscriptions.add(sub);
  if (immediate) {
    sub(getState(store), getContext(store));
  }
  return () => {
    store.subscriptions.delete(sub);
  };
}

export function reduce<U, T = any>(
  store: Store<T>,
  reducer: Subscription<T>,
  sub: (reducedState: U) => any
): Unsubscribe {
  return subscribe(store, (state, context) => {
    sub(reducer(state, context));
  });
}

export function unsubscribe<T = any>(
  store: Store<T>,
  sub: Subscription<T>
): boolean {
  return store.subscriptions.delete(sub);
}

/**
 * Returns true if all supplied keys are known.
 * @param keys One or more keys to check.
 */
export function known<T = any>(store: Store<T>, ...keys: (keyof T)[]): boolean {
  for (const key of keys) {
    if (!store.knowns.has(key)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true if any supplied keys are loading.
 * @param keys One or more keys to check.
 */
export function loading<T = any>(
  store: Store<T>,
  ...keys: (keyof T)[]
): boolean {
  for (const key of keys) {
    if (store.loadings[key]) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if none of the supplied keys are loading.
 * @param keys One or more keys to check.
 */
export function loaded<T = any>(
  store: Store<T>,
  ...keys: (keyof T)[]
): boolean {
  for (const key of keys) {
    if (store.loadings[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Returns the first error (if any) found in the specified keys.
 * @param keys One or more keys to check.
 */
export function error<T = any>(
  store: Store<T>,
  ...keys: (keyof T)[]
): Error | undefined {
  for (const key of keys) {
    if (store.errors[key]) {
      return store.errors[key];
    }
  }
  return undefined;
}

export function scheduleNotify<T = any>(store: Store<T>): void {
  if (store.notifyScheduled) {
    return;
  }

  const doNotify = () => {
    notify(store);
    store.notifyScheduled = false;
  };
  if (typeof queueMicrotask === "function") {
    queueMicrotask(doNotify);
  } else if (process && typeof process.nextTick === "function") {
    process.nextTick(doNotify);
  } else {
    setTimeout(doNotify, 0);
  }
  store.notifyScheduled = true;
}

export function notify<T = any>(store: Store<T>): void {
  for (const sub of store.subscriptions) {
    sub(getState(store), getContext(store));
  }
  store.notifyScheduled = false;
}

export interface StoreMethod<T = any> {
  (store: Store<T>, ...args: any[]): any;
}

import {
  createStore,
  set,
  subscribe,
  observer,
  untilLoaded,
} from "../../src/index";

interface Todo {
  id: string;
  position: number;
  task: string;
  done: boolean;
}

interface TodoState {
  seconds: number;
  secondsLabel: string;
  counterDone: boolean;
  todos: Todo[];
  user: { uid: string; name: string; email: string };
}

const store = createStore<TodoState>({});

let i = 1;
subscribe(store, (state, context) => {
  console.log("=== iteration", i);
  console.log("state:", state);
  console.log("context:", context);
  i++;
});

set(
  store,
  "user",
  new Promise((resolve) => {
    setTimeout(() => {
      resolve({ uid: "test123", email: "foo@example.com", name: "Foo Barr" });
    }, 1000);
  })
);

set(
  store,
  "counterDone",
  new Promise((resolve, reject) => {
    const obs = observer(store, "seconds", { transform: (v) => v / 1000 });
    let j = 0;
    const interval = setInterval(() => {
      j++;
      if (j === 5) {
        reject(new Error("something went wrong"));
      }
      if (j > 10) {
        clearInterval(interval);
        obs.complete();
        // resolve(true);
      }
      obs.next(1000 * j);
    }, 1000);
  })
);

untilLoaded(store, "user", "counterDone").then((state) => {
  console.log("Counter is done at", state.seconds, "and user is", state.user);
});

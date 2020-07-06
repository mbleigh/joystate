import { createStore, set, subscribe, observer } from "../../src/index";

interface Todo {
  id: string;
  position: number;
  task: string;
  done: boolean;
}

interface TodoState {
  seconds: number;
  secondsLabel: string;
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

const obs = observer(store, "seconds", { transform: (v) => v / 1000 });
let j = 0;
setInterval(() => {
  j++;
  if (j > 10) {
    obs.complete();
  }
  obs.next(1000 * j);
}, 1000);

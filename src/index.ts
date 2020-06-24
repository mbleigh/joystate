import { Store } from "./store";
export { Store, Status } from "./store";
import { Observable } from "rxjs";

export function createStore<T>(initialState: Partial<T> = {}): Store<T> {
  return new Store(initialState);
}

interface Todo {
  task: string;
  done: boolean;
}

interface MyState {
  todos: Todo[];
  user: { name: string; email: string };
}

const store = createStore<MyState>({});

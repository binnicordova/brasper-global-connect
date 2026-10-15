// Public Firebase web config of the `aibrasper` project. These values identify the project,
// they are not secrets: access is enforced by Firestore/Storage rules and the Cloud Functions.
type PublicEnv = {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_EMULATOR_HOST?: string;
};
const env = (import.meta.env ?? {}) as PublicEnv;

export const FIREBASE = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyBw9nZZ_9GvYIyK0E3e0ffHU_6PvW2q7kA",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "aibrasper",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "aibrasper.firebasestorage.app",
} as const;

export const FUNCTIONS_REGION = "southamerica-east1";
/** Set to the host running `bun run emulators` (e.g. `localhost`) to avoid touching production. */
const emulatorHost = env.VITE_FIREBASE_EMULATOR_HOST?.trim() || null;

export const endpoints = {
  signUp: () =>
    emulatorHost
      ? `http://${emulatorHost}:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE.apiKey}`
      : `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE.apiKey}`,
  refresh: () =>
    emulatorHost
      ? `http://${emulatorHost}:9099/securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`
      : `https://securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`,
  // Callable functions are served at https://<name-lowercase>-h5wenirx2q-rj.a.run.app
  fn: (name: string) =>
    emulatorHost
      ? `http://${emulatorHost}:5001/${FIREBASE.projectId}/${FUNCTIONS_REGION}/${name}`
      : `https://${name.toLowerCase()}-h5wenirx2q-rj.a.run.app`,
  firestore: () =>
    emulatorHost
      ? `http://${emulatorHost}:8080/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`
      : `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`,
  storageUpload: (path: string) =>
    `${
      emulatorHost ? `http://${emulatorHost}:9199` : "https://firebasestorage.googleapis.com"
    }/v0/b/${FIREBASE.storageBucket}/o?name=${encodeURIComponent(path)}`,
} as const;

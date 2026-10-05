import { ref } from 'vue'

// Result of the GitHub round trip (choose / cancelled / failed). HomeView reads it from the
// return URL; the repository screen opens the picker for "choose".
export const pendingConnectResult = ref('')
